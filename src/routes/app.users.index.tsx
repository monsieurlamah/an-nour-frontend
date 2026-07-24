import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Plus, ShieldCheck, Users, Loader2, MoreHorizontal,
  UserCheck, UserX, Mail, Eye, Trash2, Store,
} from "lucide-react";
import { usersApi, accessApi, storesApi, qk } from "@/lib/api";
import { useT, formatDateTime } from "@/lib/i18n";
import { GROUP_SLUG_LABEL as GROUP_LABEL, GROUP_SLUG_BADGE_COLOR as GROUP_COLOR } from "@/lib/auth";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { toast } from "sonner";
import type { UserRead, UserStatus, UserCreate, UserUpdate } from "@/lib/types";

export const Route = createFileRoute("/app/users/")({ component: Page });

function initials(u: { firstname: string; lastname: string }) {
  return (u.firstname[0] + u.lastname[0]).toUpperCase();
}

/** Mirrors the backend policy in security/password.py */
function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Min. 8 caractères.";
  if (!/[a-z]/.test(pw)) return "Au moins une lettre minuscule.";
  if (!/[A-Z]/.test(pw)) return "Au moins une lettre majuscule.";
  if (!/[0-9]/.test(pw)) return "Au moins un chiffre.";
  if (/^[A-Za-z0-9]+$/.test(pw)) return "Au moins un symbole (!@#$…).";
  return null;
}

function Page() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const { isSuperAdmin, has, store } = useWorkContext();
  // A network-wide team list is an HQ-capable concern — a gérant-boutique
  // (users.view without dashboard.global.view) only ever sees their own
  // boutique's team, never every user across the network (see storesApi.getUsers).
  const canView = canViewHQ(isSuperAdmin, has);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRead | null>(null);
  const [assignStoreUser, setAssignStoreUser] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRead | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: qk.access.groups,
    queryFn: () => accessApi.listGroups(),
  });

  const { data: userGroupLinks = [] } = useQuery({
    queryKey: qk.access.userGroups(),
    queryFn: () => accessApi.listUserGroups(),
  });

  const selectedGroupId = groupFilter !== "all"
    ? groups.find((g) => g.slug === groupFilter)?.id
    : undefined;

  const { data: allUsers = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.users.list({ group_id: selectedGroupId }),
    queryFn: () => usersApi.list({ limit: 500, group_id: selectedGroupId }),
  });

  const { data: storeUserLinks = [] } = useQuery({
    queryKey: qk.stores.users(store?.id ?? 0),
    queryFn: () => storesApi.getUsers(store!.id),
    enabled: !canView && !!store,
  });
  const myStoreUserIds = new Set(storeUserLinks.map((l) => l.user_id));
  const users = canView ? allUsers : allUsers.filter((u) => myStoreUserIds.has(u.id));

  // Build user → group slugs map
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));
  const userGroupSlugs = userGroupLinks.reduce<Record<number, string[]>>((acc, link) => {
    const grp = groupMap[link.group_id];
    if (grp) {
      acc[link.user_id] = [...(acc[link.user_id] ?? []), grp.slug];
    }
    return acc;
  }, {});

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      `${u.firstname} ${u.lastname}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchQ && matchStatus;
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      usersApi.update(id, {
        status: active ? "active" : "suspended",
        is_activated: active,
      } satisfies UserUpdate),
    onSuccess: (_, { active }) => {
      toast.success(active ? "Compte activé" : "Compte suspendu");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const sendCredsMutation = useMutation({
    mutationFn: (id: number) => usersApi.sendCredentials(id),
    onSuccess: () => toast.success("Nouveau mot de passe temporaire généré et envoyé par email"),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <>
      <PageHeader
        title={t("users.title") as string}
        description={t("users.subtitle") as string}
        actions={
          <>
            {has("access.manage") && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/users/permissions">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Permissions
                </Link>
              </Button>
            )}
            {has("users.manage") && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer un utilisateur
              </Button>
            )}
          </>
        }
      />

      <Card className="shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou email…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Group filter */}
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Tous les rôles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.slug}>
                  {GROUP_LABEL[g.slug] ?? g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
              <SelectItem value="suspended">Suspendu</SelectItem>
              <SelectItem value="invited">Invité</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>Utilisateur</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Rôle(s)</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Email vérifié</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : error ? (
              <tr>
                <td colSpan={7}>
                  <ApiErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                    <Users className="h-8 w-8 opacity-30" />
                    <span>Aucun utilisateur trouvé</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const slugs = userGroupSlugs[u.id] ?? [];
                const isSuspended = u.status === "suspended" || !u.is_activated;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[11px]">{initials(u)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            to="/app/users/$id"
                            params={{ id: String(u.id) }}
                            className="truncate text-sm font-medium hover:text-primary"
                          >
                            {u.firstname} {u.lastname}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{u.phone ?? ""}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {slugs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Aucun</span>
                        ) : (
                          slugs.map((s) => (
                            <span
                              key={s}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${GROUP_COLOR[s] ?? "bg-secondary text-muted-foreground border-border"}`}
                            >
                              {GROUP_LABEL[s] ?? s}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.email_verified ? "active" : "pending"} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {u.last_login_at ? formatDateTime(u.last_login_at, lang) : ""}
                    </TableCell>
                    <TableCell>
                      {has("users.manage") ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/app/users/$id" params={{ id: String(u.id) }}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> Voir le profil
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditUser(u)}>
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAssignStoreUser(u.id)}>
                              <Store className="mr-2 h-3.5 w-3.5" /> Affecter à une boutique
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => sendCredsMutation.mutate(u.id)}
                              disabled={sendCredsMutation.isPending}
                            >
                              <Mail className="mr-2 h-3.5 w-3.5" /> Envoyer les accès
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isSuspended ? (
                              <DropdownMenuItem
                                onClick={() => suspendMutation.mutate({ id: u.id, active: true })}
                                className="text-success"
                              >
                                <UserCheck className="mr-2 h-3.5 w-3.5" /> Activer
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => suspendMutation.mutate({ id: u.id, active: false })}
                                className="text-destructive"
                              >
                                <UserX className="mr-2 h-3.5 w-3.5" /> Suspendre
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(u)}
                              className="text-destructive"
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {users.length} utilisateur{users.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groups={groups}
      />

      {/* Edit User Dialog */}
      {editUser !== null && (
        <EditUserDialog
          user={editUser}
          groups={groups}
          currentGroupLinks={userGroupLinks.filter((l) => l.user_id === editUser.id)}
          onClose={() => setEditUser(null)}
        />
      )}

      {/* Assign Store Dialog */}
      {assignStoreUser !== null && (
        <AssignStoreDialog
          userId={assignStoreUser}
          onClose={() => setAssignStoreUser(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de supprimer{" "}
              <strong>{deleteTarget?.firstname} {deleteTarget?.lastname}</strong>{" "}
              ({deleteTarget?.email}). Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {deleteMutation.isPending
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Suppression…</>
                : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Create User Dialog ───────────────────────────────────────────────────── */
function CreateUserDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: { id: number; name: string; slug: string }[];
}) {
  const qc = useQueryClient();
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [storeId, setStoreId] = useState<string>("");
  const [sendCredentials, setSendCredentials] = useState(true);

  const STORE_SCOPED_SLUGS = new Set([
    "gerant-boutique", "vendeur-boutique", "caissier", "comptable", "observateur",
  ]);
  const selectedGroup = groups.find((g) => String(g.id) === groupId);
  const needsStore = selectedGroup ? STORE_SCOPED_SLUGS.has(selectedGroup.slug) : false;

  useEffect(() => {
    if (!needsStore) setStoreId("");
  }, [needsStore]);

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const user = await usersApi.create({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        status: "active",
        is_activated: true,
        send_credentials: sendCredentials,
      } satisfies UserCreate);

      // Assign group
      if (groupId) {
        await accessApi.assignUserGroup({ user_id: user.id, group_id: Number(groupId) });
      }
      // Assign store
      if (storeId) {
        await storesApi.addUser(Number(storeId), { user_id: user.id });
      }
      return user;
    },
    onSuccess: (user) => {
      toast.success(`Utilisateur "${user.firstname} ${user.lastname}" créé`);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["access"] });
      onClose();
      // reset
      setFirstname(""); setLastname(""); setEmail(""); setPhone("");
      setPassword(""); setGroupId(""); setStoreId(""); setSendCredentials(true);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const passwordError = password ? validatePassword(password) : null;
  const canSubmit = firstname.trim() && lastname.trim() && email.trim() && validatePassword(password) === null && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer un utilisateur</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prénom *</Label>
              <Input value={firstname} onChange={(e) => setFirstname(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Nom *</Label>
              <Input value={lastname} onChange={(e) => setLastname(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mot de passe temporaire *</Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ex: MonMot2024!"
                className={passwordError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {passwordError && (
                <p className="text-[11px] text-destructive">{passwordError}</p>
              )}
            </div>
          </div>
          <div className={needsStore ? "grid grid-cols-2 gap-3" : ""}>
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {GROUP_LABEL[g.slug] ?? g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsStore && (
              <div className="space-y-1.5">
                <Label>Boutique *</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border bg-secondary/30 px-3 py-2.5">
            <Checkbox
              id="send-creds"
              checked={sendCredentials}
              onCheckedChange={(v) => setSendCredentials(!!v)}
            />
            <label htmlFor="send-creds" className="text-sm cursor-pointer select-none">
              Envoyer les identifiants de connexion par email
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit User Dialog ─────────────────────────────────────────────────────── */
function EditUserDialog({
  user,
  groups,
  currentGroupLinks,
  onClose,
}: {
  user: UserRead;
  groups: { id: number; name: string; slug: string }[];
  currentGroupLinks: { id: number; group_id: number }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // State initialized from the prop (already loaded from the list — no extra fetch needed)
  const [firstname, setFirstname] = useState(user.firstname);
  const [lastname, setLastname] = useState(user.lastname);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    currentGroupLinks[0] ? String(currentGroupLinks[0].group_id) : ""
  );

  const mutation = useMutation({
    mutationFn: async () => {
      await usersApi.update(user.id, {
        firstname: firstname.trim() || undefined,
        lastname: lastname.trim() || undefined,
        phone: phone.trim() || undefined,
      } satisfies UserUpdate);

      // Reconcile group: remove current, add new if changed
      const currentGroupId = currentGroupLinks[0]?.group_id;
      const newGroupId = selectedGroupId ? Number(selectedGroupId) : null;
      if (currentGroupId !== newGroupId) {
        for (const link of currentGroupLinks) {
          await accessApi.removeUserGroup(link.id);
        }
        if (newGroupId) {
          await accessApi.assignUserGroup({ user_id: user.id, group_id: newGroupId });
        }
      }
    },
    onSuccess: () => {
      toast.success("Utilisateur mis à jour");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["access"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prénom</Label>
              <Input value={firstname} onChange={(e) => setFirstname(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={lastname} onChange={(e) => setLastname(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Aucun</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {GROUP_LABEL[g.slug] ?? g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Assign Store Dialog ──────────────────────────────────────────────────── */
function AssignStoreDialog({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState<string>("");

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const mutation = useMutation({
    mutationFn: () => storesApi.addUser(Number(storeId), { user_id: userId }),
    onSuccess: () => {
      toast.success("Utilisateur affecté à la boutique");
      qc.invalidateQueries({ queryKey: qk.users.stores(userId) });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Affecter à une boutique</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label className="mb-1.5 block">Boutique</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une boutique…" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mutation.mutate()} disabled={!storeId || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Affecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
