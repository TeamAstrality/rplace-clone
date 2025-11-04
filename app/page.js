"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabase client (must be client-side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const GRID_SIZE = 100; // 100x100 pixels
const DEFAULT_PIXEL_SIZE = 8;
const COLORS = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#ff00ff", "#00ffff", "#808080", "#ffa500"
];

export default function Page() {
  const canvasRef = useRef(null);
  const [pixelSize, setPixelSize] = useState(DEFAULT_PIXEL_SIZE);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // for pan
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [cooldown, setCooldown] = useState(false);
  const pixelsRef = useRef([]); // store all pixel data

  // Draw the canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = GRID_SIZE * pixelSize;
    canvas.height = GRID_SIZE * pixelSize;
    
    // fill background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw pixels
    pixelsRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * pixelSize + offset.x, p.y * pixelSize + offset.y, pixelSize, pixelSize);
    });

    // draw grid
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      // vertical lines
      ctx.beginPath();
      ctx.moveTo(i * pixelSize + offset.x, offset.y);
      ctx.lineTo(i * pixelSize + offset.x, GRID_SIZE * pixelSize + offset.y);
      ctx.stroke();

      // horizontal lines
      ctx.beginPath();
      ctx.moveTo(offset.x, i * pixelSize + offset.y);
      ctx.lineTo(GRID_SIZE * pixelSize + offset.x, i * pixelSize + offset.y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    // load pixels from Supabase
    supabase.from("pixels").select("*").then(({ data }) => {
      if (data) {
        pixelsRef.current = data;
        drawCanvas();
      }
    });

    // subscribe to realtime updates
    const channel = supabase.channel("pixels")
      .on("postgres_changes", { event: "*", schema: "public", table: "pixels" },
        payload => {
          const { x, y, color } = payload.new;
          const index = pixelsRef.current.findIndex(p => p.x === x && p.y === y);
          if (index >= 0) pixelsRef.current[index].color = color;
          else pixelsRef.current.push({ x, y, color });
          drawCanvas();
        })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [pixelSize, offset]);

  // place a pixel
  const handleClick = e => {
    if (cooldown) return alert("Wait for cooldown!");
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - offset.x) / pixelSize);
    const y = Math.floor((e.clientY - rect.top - offset.y) / pixelSize);
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;

    supabase.from("pixels").upsert({ x, y, color: selectedColor });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);
  };

  // handle zoom
  const handleWheel = e => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 0.9; // zoom factor
    const newPixelSize = Math.min(50, Math.max(4, pixelSize * delta));

    // adjust offset to zoom on mouse
    const offsetX = mouseX - ((mouseX - offset.x) * newPixelSize) / pixelSize;
    const offsetY = mouseY - ((mouseY - offset.y) * newPixelSize) / pixelSize;

    setPixelSize(newPixelSize);
    setOffset({ x: offsetX, y: offsetY });
  };

  return (
    <div style={{ userSelect: "none", textAlign: "center", padding: 16 }}>
      <canvas
        ref={canvasRef}
        style={{ border: "1px solid #999", cursor: "crosshair" }}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <div style={{ marginTop: 10 }}>
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setSelectedColor(c)}
            style={{
              background: c,
              width: 24,
              height: 24,
              border: selectedColor === c ? "3px solid black" : "1px solid #999",
              margin: 2
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, marginTop: 5 }}>Scroll to zoom (centered on mouse). Click to place pixel. Cooldown 3s.</p>
    </div>
  );
}
