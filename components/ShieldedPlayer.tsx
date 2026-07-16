const PLAYER_SANDBOX = "allow-scripts allow-presentation allow-same-origin";

export default function ShieldedPlayer({ url }: { url: string }) {
  const src = `/api/embed?u=${encodeURIComponent(url)}&p=${encodeURIComponent(url)}`;

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
