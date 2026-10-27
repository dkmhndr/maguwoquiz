import Link from "next/link";
import { ArrowIcon, BrandMark, GiftIcon } from "@/components/icons";

export default function HomePage() {
  return (
    <div className="landing">
      <header className="topbar">
        <Link className="brand" href="/">
          <BrandMark />
        </Link>
        <Link href="/host" className="host-link">
          Host desk <ArrowIcon />
        </Link>
      </header>
      <main className="landing-main">
        <section className="landing-copy">
          <span className="eyebrow">
            <span className="little-line" /> A PRIVATE LITTLE GET-TOGETHER
          </span>
          <h1>
            Good friends.
            <br />
            Great stories.
            <br />
            <em>Little surprises.</em>
          </h1>
          <p>
            Seberapa dekat kamu mengenal temanmu?
            <br />
            Siapa yang paling perhatian diantara kalian?
          </p>
          <Link href="/play" className="button primary">
            Aku punya undangan
            <ArrowIcon />
          </Link>
          <p className="invitation-note">Masuk lewat link pribadi yang dibagikan host.</p>
        </section>
        <section className="landing-art" aria-label="Semua peserta mendapat satu hadiah">
          <span className="art-label">A GIFT FOR EVERY FRIEND</span>
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <GiftIcon className="hero-gift" />
          <span className="art-sticker">
            It's a<br />
            <em>good day</em>
            <br />
            to bond.
          </span>
          <div className="art-bottom">
            <span className="art-emoji" aria-hidden="true">
              ✨
            </span>
            <p>
              Everyone gets
              <br />a little joy.
            </p>
            <span>
              NO ONE
              <br />
              GOES HOME
              <br />
              EMPTY-HANDED.
            </span>
          </div>
        </section>
      </main>
      <footer className="footer">
        <span>Made with ❤️ by AI JALA.</span>
        <span>Maguwonian Together Stronk</span>
      </footer>
    </div>
  );
}
