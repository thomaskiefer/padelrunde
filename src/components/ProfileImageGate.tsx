import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { ImageCropper } from "./ImageCropper";
import { Button } from "~/components/ui/button";

export function ProfileImageGate() {
  const { user } = useUser();
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    };
  }, [selfiePreview]);

  function handleCameraSelect(file: File | undefined) {
    if (!file) return;
    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
      setSelfiePreview(null);
    }
    setCroppedBlob(null);
    setCropFile(file);
    setError(null);
  }

  function handleGallerySelect(file: File | undefined) {
    if (!file) return;
    setCropFile(file);
    setError(null);
  }

  function handleCropComplete(blob: Blob) {
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setCroppedBlob(blob);
    setSelfiePreview(URL.createObjectURL(blob));
    setCropFile(null);
    setError(null);
  }

  function handleCropCancel() {
    setCropFile(null);
  }

  function handleRetake() {
    setCroppedBlob(null);
    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
      setSelfiePreview(null);
    }
  }

  async function handleUpload() {
    if (!croppedBlob || !user) return;
    setUploading(true);
    setError(null);
    try {
      const file = new File([croppedBlob], "profile.jpg", {
        type: "image/jpeg",
      });
      await user.setProfileImage({ file });
    } catch {
      setError("Upload fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <main className="min-h-[calc(100vh-60px)] flex flex-col items-center justify-center px-4 py-8">
        <div
          className={`w-full max-w-sm flex flex-col items-center gap-6 animate-fade-in-up${cropFile ? " invisible" : ""}`}
        >
          {/* Heading */}
          <div className="text-center">
            <h1 className="font-display text-2xl text-brand-navy uppercase tracking-wider">
              Profilfoto
            </h1>
            <p className="text-gray-500 text-sm mt-2 max-w-[280px] leading-relaxed">
              Bitte lade ein Foto hoch, damit andere dich erkennen können.
            </p>
          </div>

          {/* Photo area */}
          <div className="flex flex-col items-center gap-2 mt-2">
            {selfiePreview ? (
              <div className="relative">
                <img
                  src={selfiePreview}
                  alt="Dein Foto"
                  className="w-[200px] h-[200px] rounded-full object-cover ring-4 ring-brand-navy/15 shadow-lg"
                />
                <button
                  type="button"
                  onClick={handleRetake}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white text-gray-600 text-sm px-4 py-2 rounded-full min-h-[44px] border border-gray-200 font-medium shadow-sm hover:bg-gray-50 transition-colors"
                >
                  Ändern
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  aria-label="Foto aufnehmen"
                  className="w-[200px] h-[200px] rounded-full bg-gray-50 border-2 border-dashed border-brand-navy/15 flex flex-col items-center justify-center gap-2.5 active:border-brand-navy/30 transition-all hover:border-brand-navy/25 hover:bg-gray-100/80"
                >
                  <svg
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-brand-navy/30"
                    aria-hidden="true"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-brand-navy/35 text-sm font-medium">
                    Foto aufnehmen
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="text-gray-400 text-sm min-h-[44px] flex items-center hover:text-gray-600 transition-colors"
                >
                  oder aus Galerie wählen
                </button>
              </>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                handleCameraSelect(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleGallerySelect(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-brand-red text-sm text-center">
              {error}
            </p>
          )}

          {/* Submit */}
          {selfiePreview && (
            <Button
              variant="brandNavy"
              size="touchXl"
              className="w-full mt-4"
              disabled={!croppedBlob || uploading}
              onClick={handleUpload}
            >
              {uploading ? "Wird hochgeladen..." : "WEITER"}
            </Button>
          )}
        </div>
      </main>

      {cropFile && (
        <ImageCropper
          imageFile={cropFile}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}
