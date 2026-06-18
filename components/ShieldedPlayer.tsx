export default function ShieldedPlayer({ url }: { url: string }) {
  return (
    <iframe
      key={url}
      src={url}
      className="player-iframe"
      title="Live stream"
      allowFullScreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    />
  );
}
