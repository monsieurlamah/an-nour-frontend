import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mail, ShieldCheck, Store, UserCheck, UserX, Plus, Trash2,
  MoreHorizontal, ChevronLeft, Loader2, KeyRound,
} from "lucide-react";
import { usersApi, accessApi, storesApi, qk } from "@/lib/api";
import { formatDateTime } from "@/lib/i18n";
import { GROUP_SLUG_LABEL as GROUP_LABEL, GROUP_SLUG_BADGE_COLOR as GROUP_COLOR } from "@/lib/auth";
import { useWorkContext } from "@/lib/work-context";
import { SetPasswordDialog } from "@/components/users/set-password-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/users/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const userId = Number(id);
  const qc = useQueryClient();
  const { has } = useWorkContext();
  const canManage = has("users.manage");
  // Role assignment and store assignment are gated by their own backend
  // permissions (access.manage / stores.manage respectively) — distinct
  // from users.manage (account suspend/activate/send-credentials).
  const canManageRoles = has("access.manage");
  const canManageStores = has("stores.manage");
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.users.detail(userId),
    queryFn: () => usersApi.get(userId),
  });

  const { data: userGroupLinks = [] } = useQuery({
    queryKey: qk.users.groups(userId),
    queryFn: () => usersApi.listGroups(userId),
  });

  const { data: userStores = [] } = useQuery({
    queryKey: qk.users.stores(userId),
    queryFn: () => usersApi.listStores(userId),
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: qk.access.groups,
    queryFn: () => accessApi.listGroups(),
  });

  const { data: allStores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const storeMap = Object.fromEntries(allStores.map((s) => [s.id, s]));
  const groupMap = Object.fromEntries(allGroups.map((g) => [g.id, g]));

  const sendCredsMutation = useMutation({
    mutationFn: () => usersApi.sendCredentials(userId),
    onSuccess: () => toast.success("Identifiants envoyés par email"),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const suspendMutation = useMutation({
    mutationFn: (active: boolean) =>
      usersApi.update(userId, { status: active ? "active" : "suspended", is_activated: active }),
    onSuccess: (_, active) => {
      toast.success(active ? "Compte activé" : "Compte suspendu");
      qc.invalidateQueries({ queryKey: qk.users.detail(userId) });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const removeGroupMutation = useMutation({
    mutationFn: (linkId: number) => accessApi.removeUserGroup(linkId),
    onSuccess: () => {
      toast.success("Rôle retiré");
      qc.invalidateQueries({ queryKey: qk.users.groups(userId) });
      qc.invalidateQueries({ queryKey: qk.access.userGroups() });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error || !user) return <ApiErrorState error={error ?? new Error("User not found")} onRetry={refetch} />;

  const isSuspended = user.status === "suspended" || !user.is_activated;
  const initials = (user.firstname[0] + user.lastname[0]).toUpperCase();
  const assignedGroupIds = new Set(userGroupLinks.map((l) => l.group_id));

  return (
    <>
      <PageHeader
        title={`${user.firstname} ${user.lastname}`}
        description={user.email}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/users">
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Retour
              </Link>
            </Button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSetPasswordOpen(true)}>
                    <KeyRound className="mr-2 h-3.5 w-3.5" /> Réinitialiser le mot de passe
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => sendCredsMutation.mutate()}
                    disabled={sendCredsMutation.isPending}
                  >
                    <Mail className="mr-2 h-3.5 w-3.5" /> Envoyer les accès par email
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isSuspended ? (
                    <DropdownMenuItem
                      onClick={() => suspendMutation.mutate(true)}
                      className="text-success"
                    >
                      <UserCheck className="mr-2 h-3.5 w-3.5" /> Activer le compte
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => suspendMutation.mutate(false)}
                      className="text-destructive"
                    >
                      <UserX className="mr-2 h-3.5 w-3.5" /> Suspendre le compte
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile card */}
        <Card className="shadow-soft lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user.firstname} {user.lastname}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <StatusBadge status={user.status} />
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Téléphone</span>
                <span>{user.phone ?? ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email vérifié</span>
                <StatusBadge status={user.email_verified ? "active" : "pending"} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mot de passe temporaire</span>
                <span>
                  {user.must_change_password ? (
                    <Badge variant="outline" className="text-[11px] border-amber-400 text-amber-600">
                      <KeyRound className="mr-1 h-2.5 w-2.5" /> À changer
                    </Badge>
                  ) : "Non"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dernière connexion</span>
                <span className="text-xs">
                  {user.last_login_at ? formatDateTime(user.last_login_at, "fr") : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créé le</span>
                <span className="text-xs">{formatDateTime(user.created_at, "fr")}</span>
              </div>
            </div>

            {canManage && (
              <div className="mt-6 space-y-2">
                <Button
                  className="w-full"
                  size="sm"
                  variant="outline"
                  onClick={() => setSetPasswordOpen(true)}
                >
                  <KeyRound className="mr-1.5 h-4 w-4" />
                  Réinitialiser le mot de passe
                </Button>
                <Button
                  className="w-full"
                  size="sm"
                  variant="outline"
                  onClick={() => sendCredsMutation.mutate()}
                  disabled={sendCredsMutation.isPending}
                >
                  {sendCredsMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-1.5 h-4 w-4" />
                  )}
                  Envoyer les accès
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* Roles card */}
          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Rôles
              </CardTitle>
              {canManageRoles && (
                <Button size="sm" variant="outline" onClick={() => setAddGroupOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {userGroupLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun rôle assigné.</p>
              ) : (
                <div className="space-y-2">
                  {userGroupLinks.map((link) => {
                    const grp = groupMap[link.group_id];
                    if (!grp) return null;
                    return (
                      <div
                        key={link.id}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${GROUP_COLOR[grp.slug] ?? "bg-secondary text-foreground border-border"}`}
                        >
                          {GROUP_LABEL[grp.slug] ?? grp.name}
                        </span>
                        <p className="mr-auto ml-3 text-xs text-muted-foreground">
                          {grp.description}
                        </p>
                        {canManageRoles && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                disabled={removeGroupMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Retirer ce rôle ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Le rôle <strong>{GROUP_LABEL[grp.slug] ?? grp.name}</strong> sera retiré de cet utilisateur.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeGroupMutation.mutate(link.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Retirer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stores card */}
          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4 text-muted-foreground" /> Boutiques assignées
              </CardTitle>
              {canManageStores && (
                <Button size="sm" variant="outline" onClick={() => setAddStoreOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Affecter
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {userStores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune boutique assignée.</p>
              ) : (
                <div className="space-y-2">
                  {userStores.map((su) => {
                    const store = storeMap[su.store_id];
                    return (
                      <div
                        key={su.id}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            to="/app/stores/$id"
                            params={{ id: String(su.store_id) }}
                            className="text-sm font-medium hover:text-primary"
                          >
                            {store?.name ?? `Boutique #${su.store_id}`}
                          </Link>
                          {store?.city && (
                            <p className="text-xs text-muted-foreground">{store.city}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Group Dialog */}
      <AddGroupDialog
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        userId={userId}
        allGroups={allGroups}
        assignedGroupIds={assignedGroupIds}
      />

      {/* Add Store Dialog */}
      <AddStoreDialog
        open={addStoreOpen}
        onClose={() => setAddStoreOpen(false)}
        userId={userId}
        allStores={allStores}
      />

      <SetPasswordDialog
        open={setPasswordOpen}
        onClose={() => setSetPasswordOpen(false)}
        userId={userId}
        userName={`${user.firstname} ${user.lastname}`.trim()}
      />
    </>
  );
}

function AddGroupDialog({
  open,
  onClose,
  userId,
  allGroups,
  assignedGroupIds,
}: {
  open: boolean;
  onClose: () => void;
  userId: number;
  allGroups: { id: number; name: string; slug: string; description: string | null }[];
  assignedGroupIds: Set<number>;
}) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string>("");

  const availableGroups = allGroups.filter((g) => !assignedGroupIds.has(g.id));

  const mutation = useMutation({
    mutationFn: () =>
      accessApi.assignUserGroup({ user_id: userId, group_id: Number(groupId) }),
    onSuccess: () => {
      toast.success("Rôle assigné");
      qc.invalidateQueries({ queryKey: qk.users.groups(userId) });
      qc.invalidateQueries({ queryKey: qk.access.userGroups() });
      setGroupId("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assigner un rôle</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un rôle…" />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.length === 0 ? (
                <SelectItem value="_none" disabled>
                  Tous les rôles sont déjà assignés
                </SelectItem>
              ) : (
                availableGroups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {GROUP_LABEL[g.slug] ?? g.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!groupId || mutation.isPending || availableGroups.length === 0}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Assigner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddStoreDialog({
  open,
  onClose,
  userId,
  allStores,
}: {
  open: boolean;
  onClose: () => void;
  userId: number;
  allStores: { id: number; name: string }[];
}) {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState<string>("");

  const mutation = useMutation({
    mutationFn: () => storesApi.addUser(Number(storeId), { user_id: userId }),
    onSuccess: () => {
      toast.success("Boutique affectée");
      qc.invalidateQueries({ queryKey: qk.users.stores(userId) });
      setStoreId("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Affecter à une boutique</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une boutique…" />
            </SelectTrigger>
            <SelectContent>
              {allStores.map((s) => (
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
