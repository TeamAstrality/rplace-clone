"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// connect to Supabase (public credentials)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const GRID = 100;
const PIXEL_SIZE = 6;
const COLORS = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#ff00ff", "#00ffff", "#808080", "#ffa500"
];

export default function Home() {
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState("#000000");
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = GRID * PIXEL_SIZE;
    canvasRef.current.height = GRID * PIXEL_SIZE;

    // Load all pixels
    supabase.from("pixels").select("*").then(({ data }) => {
      if (data) {
        data.forEach(p => {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x * PIXEL_SIZE, p.y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        });
      }
    });

    // Subscribe to realtime updates
    const channel = supabase.channel("pixels")
      .on("postgres_changes", { event: "*", schema: "public", table: "pixels" },
        (payload) => {
          const { x, y, color } = payload.new;
          ctx.fillStyle = color;
          ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const placePixel = async (e) => {
    if (cooldown) return alert("Cooldown active. Wait a bit!");
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / PIXEL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / PIXEL_SIZE);
    await supabase.from("pixels").upsert({ x, y, color: selected });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);
  };

  return (
    <main className="flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4">r/place Clone 🎨</h1>
      <canvas
        ref={canvasRef}
        onClick={placePixel}
        className="border border-gray-400 cursor-crosshair"
      />
      <div className="flex gap-2 mt-4 flex-wrap justify-center">
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setSelected(c)}
            style={{
              backgroundColor: c,
              width: 24,
              height: 24,
              border: selected === c ? "3px solid black" : "1px solid #999",
              borderRadius: 4
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-gray-500 text-sm">
        Click a color, then click a pixel — cooldown 3s.
      </p>
    </main>
  );
}
