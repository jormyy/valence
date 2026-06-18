export default function ShieldedPlayer({ url }: { url: string }) {
  const src = `/api/embed?u=${encodeURIComponent(url)}`;

  return (
    <iframe
      key={src}
      src={src}
      className="player-iframe"
      title="Live stream"
      allowFullScreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerPolicy="no-referrer"
    />
  );
}
