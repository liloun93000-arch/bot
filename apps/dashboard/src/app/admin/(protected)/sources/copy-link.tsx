"use client";

import { useState } from "react";

export function CopyLink({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="aj-src-link">
      <input readOnly value={value} className="input" onFocus={(e) => e.currentTarget.select()} aria-label="Lien de suivi" />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setOk(true);
              setTimeout(() => setOk(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {ok ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}
