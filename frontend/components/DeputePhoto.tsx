"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

type DeputePhotoProps = {
  prenom: string;
  nom: string;
  size?: "sm" | "lg";
  className?: string;
};

export default function DeputePhoto({ prenom, nom, size = "sm", className }: DeputePhotoProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setSrc(null);
    const url = `${API_URL}/api/suivi-mun/photo?prenom=${encodeURIComponent(prenom)}&nom=${encodeURIComponent(nom)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("photo not found");
        return r.blob();
      })
      .then((blob) => setSrc(URL.createObjectURL(blob)))
      .catch(() => setFailed(true));
  }, [prenom, nom]);

  const sizeClass = size === "lg"
    ? "w-20 h-20 text-lg"
    : "w-8 h-8 text-[11px]";

  const imgClass = size === "lg"
    ? "w-20 h-20 rounded-full object-cover object-[50%_20%] flex-shrink-0 bg-slate-100"
    : "w-8 h-8 rounded-full object-cover object-[50%_20%] flex-shrink-0 bg-slate-100";

  if (failed || !src) {
    const initials = `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
    return (
      <div
        className={`${sizeClass} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-500 flex-shrink-0 ${className ?? ""}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${prenom} ${nom}`}
      className={`${imgClass} ${className ?? ""}`}
      onError={() => setFailed(true)}
    />
  );
}
