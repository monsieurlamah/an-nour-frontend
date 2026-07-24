import { useRef, useState, useCallback } from "react";
import { uploadApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ImageIcon, UploadCloud, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  value?: string | null;
  onChange: (url: string | null) => void;
  className?: string;
  label?: string;
}

export function ImageUpload({ value, onChange, className, label = "Image du produit" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);

      const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!ALLOWED.includes(file.type)) {
        setError("Format non supporté. Utilisez JPEG, PNG, WebP ou GIF.");
        setProgress(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Fichier trop volumineux (max 10 Mo).");
        setProgress(null);
        return;
      }

      try {
        const result = await uploadApi.image(file, setProgress);
        onChange(result.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'upload.");
      } finally {
        setProgress(null);
      }
    },
    [onChange],
  );

  const handleFile = useCallback(
    (files: FileList | null) => {
      if (files && files[0]) upload(files[0]);
    },
    [upload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const remove = useCallback(() => {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  const isUploading = progress !== null;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <p className="text-sm font-medium leading-none">{label}</p>
      )}

      {/* Preview */}
      {value && !isUploading ? (
        <div className="group relative aspect-square w-full max-w-[200px] overflow-hidden rounded-xl border bg-secondary">
          <img
            src={value}
            alt="Aperçu"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-8 w-8"
              onClick={remove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium shadow backdrop-blur-sm transition hover:bg-white"
          >
            Changer
          </button>
        </div>
      ) : (
        /* Drop zone */
        <button
          type="button"
          onClick={() => !isUploading && inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/60 hover:bg-secondary/50",
            isUploading && "pointer-events-none opacity-60",
          )}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Envoi en cours…</p>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </>
          ) : dragging ? (
            <>
              <UploadCloud className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-primary">Déposer l'image ici</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  <span className="text-primary">Cliquer pour parcourir</span> ou glisser-déposer
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPG, WebP, GIF · max 10 Mo
                </p>
              </div>
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  );
}
