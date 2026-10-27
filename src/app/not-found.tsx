import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <span className="eyebrow">A LITTLE DETOUR</span>
      <h1>
        Halaman ini
        <br />
        tidak ada.
      </h1>
      <Link href="/" className="button primary">
        Kembali ke beranda
      </Link>
    </main>
  );
}
