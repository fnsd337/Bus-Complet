export default function PlayerAvatar({ value, className = "" }: { value: string; className?: string }) {
  const isImage = /^(https?:\/\/|blob:)/i.test(value);
  return <span className={`player-avatar ${className}`} aria-hidden="true">
    {isImage ? <img src={value} alt="" loading="lazy" /> : value}
  </span>;
}
