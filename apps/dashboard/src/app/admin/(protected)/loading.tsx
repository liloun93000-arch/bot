/** Squelette affiché pendant le chargement d'une page du back-office. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <div className="aj-skel" style={{ height: 150, borderRadius: 20 }} />
      <div className="aj-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aj-skel" style={{ height: 70 }} />
        ))}
      </div>
      <div className="aj-skel" style={{ height: 22, width: "55%" }} />
      <div className="aj-skel" style={{ height: 62 }} />
      <div className="aj-skel" style={{ height: 62 }} />
      <div className="aj-skel" style={{ height: 62 }} />
    </div>
  );
}
