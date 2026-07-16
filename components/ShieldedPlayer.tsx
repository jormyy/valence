// /api/player-frame redirects onto a dedicated player hostname before any provider
// document runs. Providers can retain that isolated origin for storage/native HLS
// without sharing the parent app's DOM or storage boundary.
const PLAYER_SANDBOX = "allow-scripts allow-presentation allow-same-origin";

export default function ShieldedPlayer({ url }: { url: string }) {
  const src = `/api/player-frame?u=${encodeURIComponent(url)}`;

  return (
    <iframe
      src={src}
      className="player-iframe"
      title="Live stream"
      allowFullScreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      sandbox={PLAYER_SANDBOX}
      referrerPolicy="no-referrer"
    />
  );
}
