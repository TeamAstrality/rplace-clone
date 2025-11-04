"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const GRID_SIZE = 100; // 100x100 pixels
const DEFAULT_PIXEL_SIZE = 10;
const COLORS = [
  "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#ff00ff", "#00ffff", "#808080", "#ffa500"
];

export default function Page() {
  const canvasRef = useRef(null);
  const [pixelSize, setPixelSize] = useState(DEFAULT_PIXEL_SIZE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [cooldown, setCooldown] = useState(false);
  const pixelsRef = useRef([]);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Draw the canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw pixels
    pixelsRef.current.forEach(p => {
      ctx.fillStyle = p.color || "#ffffff";
      ctx.fillRect(
        Math.round(p.x * pixelSize + offset.x),
        Math.round(p.y * pixelSize + offset.y),
        Math.ceil(pixelSize),
        Math.ceil(pixelSize)
      );
    });

    // draw grid
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * pixelSize + offset.x + 0.5, offset.y);
      ctx.lineTo(i * pixelSize + offset.x + 0.5, GRID_SIZE * pixelSize + offset.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(offset.x, i * pixelSize + offset.y + 0.5);
      ctx.lineTo(GRID_SIZE * pixelSize + offset.x, i * pixelSize + offset.y + 0.5);
      ctx.stroke();
    }
  };

  // Initial setup
  useEffect(() => {
    setOffset({
      x: window.innerWidth / 2 - (GRID_SIZE * pixelSize) / 2,
      y: window.innerHeight / 2 - (GRID_SIZE * pixelSize) / 2
    });

    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);

    supabase.from("pixels").select("*").then(({ data }) => {
      if (data) {
        pixelsRef.current = data;
        drawCanvas();
      }
    });

    const channel = supabase.channel("pixels")
      .on("postgres_changes", { event: "*", schema: "public", table: "pixels" },
        payload => {
          const { x, y, color } = payload.new;
          const idx = pixelsRef.current.findIndex(p => p.x === x && p.y === y);
          if (idx >= 0) pixelsRef.current[idx].color = color;
          else pixelsRef.current.push({ x, y, color });
          drawCanvas();
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Click to place pixel
  const handleClick = e => {
    if (cooldown) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - offset.x) / pixelSize);
    const y = Math.floor((e.clientY - rect.top - offset.y) / pixelSize);
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;

    supabase.from("pixels").upsert({ x, y, color: selectedColor });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);
  };

  // Mouse wheel zoom
  const handleWheel = e => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newPixelSize = Math.min(50, Math.max(4, pixelSize * delta));

    const offsetX = mouseX - ((mouseX - offset.x) * newPixelSize) / pixelSize;
    const offsetY = mouseY - ((mouseY - offset.y) * newPixelSize) / pixelSize;

    setPixelSize(newPixelSize);
    setOffset({ x: offsetX, y: offsetY });
  };

  // Mouse drag pan
  const handleMouseDown = e => {
    draggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = e => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  const handleMouseUp = () => {
    draggingRef.current = false;
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100vw", height: "100vh", cursor: "crosshair" }}
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div style={{
        position: "fixed",
        top: 10,
        left: 10,
        background: "rgba(255,255,255,0.8)",
        padding: 5,
        borderRadius: 5,
        display: "flex",
        gap: 5
      }}>
        {COLORS.map(c => (
          <div
            key={c}
            onClick={() => setSelectedColor(c)}
            style={{
              width: 24,
              height: 24,
              background: c,
              border: selectedColor === c ? "3px solid black" : "1px solid #999",
              cursor: "pointer"
            }}
          />
        ))}
      </div>
    </>
  );
}
