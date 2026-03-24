import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";

const userState: {
  user: {
    setProfileImage: ReturnType<typeof mock>;
  } | null;
} = {
  user: {
    setProfileImage: mock(() => Promise.resolve(undefined)),
  },
};

mock.module("@clerk/tanstack-react-start", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  SignInButton: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ isSignedIn: true }),
  useClerk: () => ({
    signOut: () => Promise.resolve(),
    openUserProfile: () => undefined,
  }),
  useUser: () => userState,
}));

mock.module("./ImageCropper", () => ({
  ImageCropper: ({
    onCrop,
    onCancel,
  }: {
    onCrop: (blob: Blob) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onCrop(new Blob(["cropped"], { type: "image/jpeg" }))}>
        crop-complete
      </button>
      <button type="button" onClick={onCancel}>
        crop-cancel
      </button>
    </div>
  ),
}));

describe("ProfileImageGate", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost:3000",
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      HTMLElement: dom.window.HTMLElement,
      HTMLInputElement: dom.window.HTMLInputElement,
      File: dom.window.File,
    });
    URL.createObjectURL = mock(() => "blob:mock-preview");
    URL.revokeObjectURL = mock(() => undefined);
    userState.user = {
      setProfileImage: mock(() => Promise.resolve(undefined)),
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("renders the initial upload prompt", async () => {
    const { ProfileImageGate } = await import("./ProfileImageGate");
    const view = render(<ProfileImageGate />);

    expect(view.getByText("Profilfoto")).toBeDefined();
    expect(view.getByText("Foto aufnehmen")).toBeDefined();
    expect(view.queryByRole("button", { name: "WEITER" })).toBeNull();
  });

  it("opens and cancels the cropper for gallery uploads", async () => {
    const { ProfileImageGate } = await import("./ProfileImageGate");
    const view = render(<ProfileImageGate />);

    const fileInputs = view.container.querySelectorAll('input[type="file"]');
    const galleryInput = fileInputs[1] as HTMLInputElement | undefined;
    if (!galleryInput) throw new Error("Missing gallery input");

    fireEvent.change(galleryInput, {
      target: {
        files: [new File(["gallery"], "gallery.jpg", { type: "image/jpeg" })],
      },
    });

    expect(view.getByText("crop-complete")).toBeDefined();
    fireEvent.click(view.getByText("crop-cancel"));
    expect(view.queryByText("crop-complete")).toBeNull();
  });

  it("uploads the cropped image through Clerk", async () => {
    const { ProfileImageGate } = await import("./ProfileImageGate");
    const view = render(<ProfileImageGate />);

    const fileInputs = view.container.querySelectorAll('input[type="file"]');
    const galleryInput = fileInputs[1] as HTMLInputElement | undefined;
    if (!galleryInput) throw new Error("Missing gallery input");

    fireEvent.change(galleryInput, {
      target: {
        files: [new File(["gallery"], "gallery.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.click(view.getByText("crop-complete"));
    fireEvent.click(view.getByRole("button", { name: "WEITER" }));

    await waitFor(() => {
      expect(userState.user?.setProfileImage).toHaveBeenCalledTimes(1);
    });

    const payload = userState.user?.setProfileImage.mock.calls[0]?.[0];
    expect(payload?.file).toBeInstanceOf(File);
    expect(payload?.file?.type).toBe("image/jpeg");
  });

  it("shows an inline error when the upload fails", async () => {
    userState.user = {
      setProfileImage: mock(() => Promise.reject(new Error("Upload failed"))),
    };
    const { ProfileImageGate } = await import("./ProfileImageGate");
    const view = render(<ProfileImageGate />);

    const fileInputs = view.container.querySelectorAll('input[type="file"]');
    const galleryInput = fileInputs[1] as HTMLInputElement | undefined;
    if (!galleryInput) throw new Error("Missing gallery input");

    fireEvent.change(galleryInput, {
      target: {
        files: [new File(["gallery"], "gallery.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.click(view.getByText("crop-complete"));
    fireEvent.click(view.getByRole("button", { name: "WEITER" }));

    await waitFor(() => {
      expect(view.getByRole("alert")).toBeDefined();
      expect(view.getByText("Upload fehlgeschlagen. Bitte versuche es erneut.")).toBeDefined();
    });
  });
});
