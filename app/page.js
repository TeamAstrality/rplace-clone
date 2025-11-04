"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const DEFAULT_GRID_SIZE = { width: 100, height: 100 };
const DEFAULT_PIXEL_SIZE = 10;
const COLORS = [
  "#ffffff","#000000","#ff0000","#00ff00","#0000ff",
  "#ffff00","#ff00ff","#00ffff","#808080","#ffa500"
];

export default function Page() {
  const canvasRef = useRef(null);
  const [pixelSize, setPixelSize] = useState(DEFAULT_PIXEL_SIZE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [cooldown, setCooldown] = useState(false);

  const pixelsRef = useRef([]);
  const gridSizeRef = useRef({ ...DEFAULT_GRID_SIZE });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // draw pixels
    pixelsRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(
        p.x*pixelSize + offset.x,
        p.y*pixelSize + offset.y,
        Math.ceil(pixelSize),
        Math.ceil(pixelSize)
      );
    });

    // draw grid
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.5;
    for(let i=0;i<=gridSizeRef.current.width;i++){
      ctx.beginPath();
      ctx.moveTo(i*pixelSize + offset.x + 0.5, offset.y);
      ctx.lineTo(i*pixelSize + offset.x + 0.5, gridSizeRef.current.height*pixelSize + offset.y);
      ctx.stroke();
    }
    for(let i=0;i<=gridSizeRef.current.height;i++){
      ctx.beginPath();
      ctx.moveTo(offset.x, i*pixelSize + offset.y + 0.5);
      ctx.lineTo(gridSizeRef.current.width*pixelSize + offset.x, i*pixelSize + offset.y + 0.5);
      ctx.stroke();
    }
  };

  const checkExpandGrid = () => {
    const totalPixels = gridSizeRef.current.width * gridSizeRef.current.height;
    const placedPixels = pixelsRef.current.length; // count only placed pixels

    if (placedPixels >= totalPixels) {
      if (gridSizeRef.current.width === gridSizeRef.current.height) {
        gridSizeRef.current.width *= 2;
        gridSizeRef.current.height *= 2;
      } else if (gridSizeRef.current.width < gridSizeRef.current.height) {
        gridSizeRef.current.width *= 2;
      } else {
        gridSizeRef.current.height *= 2;
      }
      drawCanvas();
    }
  };

  useEffect(() => {
    // center grid initially
    setOffset({
      x: window.innerWidth/2 - (gridSizeRef.current.width*pixelSize)/2,
      y: window.innerHeight/2 - (gridSizeRef.current.height*pixelSize)/2
    });

    // fetch initial pixels
    supabase.from("pixels").select("*").then(({ data }) => {
      if (data) {
        pixelsRef.current = data.map(p => ({ x: p.x, y: p.y, color: p.color }));
        drawCanvas();
      }
    });

    // realtime updates
    const channel = supabase.channel("pixels")
      .on("postgres_changes", { event: "*", schema: "public", table: "pixels" },
        payload => {
          const { x, y, color } = payload.new;
          const idx = pixelsRef.current.findIndex(p => p.x===x && p.y===y);
          if(idx>=0) pixelsRef.current[idx].color = color;
          else pixelsRef.current.push({x,y,color});
          drawCanvas();
          checkExpandGrid();
        }).subscribe();

    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);

    return ()=>{
      supabase.removeChannel(channel);
      window.removeEventListener("resize", handleResize);
    };
  },[]);

  const handleClick = e => {
    if(cooldown) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width/rect.width;
    const scaleY = canvasRef.current.height/rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX - offset.x)/pixelSize;
    const y = Math.floor((e.clientY - rect.top) * scaleY - offset.y)/pixelSize;

    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if(ix<0||ix>=gridSizeRef.current.width||iy<0||iy>=gridSizeRef.current.height) return;

    supabase.from("pixels").upsert({x: ix, y: iy, color: selectedColor});
    setCooldown(true);
    setTimeout(()=>setCooldown(false),3000);
  };

  const handleWheel = e => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY<0?1.1:0.9;
    const newPixelSize = Math.min(50, Math.max(4, pixelSize*delta));

    const offsetX = mouseX - ((mouseX - offset.x)*newPixelSize)/pixelSize;
    const offsetY = mouseY - ((mouseY - offset.y)*newPixelSize)/pixelSize;

    setPixelSize(newPixelSize);
    setOffset({x: offsetX, y: offsetY});
  };

  const handleMouseDown = e => {
    draggingRef.current = true;
    lastMouseRef.current = {x:e.clientX,y:e.clientY};
  };
  const handleMouseMove = e => {
    if(!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = {x:e.clientX,y:e.clientY};
    setOffset(prev=>({x: prev.x + dx, y: prev.y + dy}));
  };
  const handleMouseUp = () => { draggingRef.current = false; };

  useEffect(()=>{ drawCanvas(); },[offset,pixelSize]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{display:"block",width:"100vw",height:"100vh",cursor:"crosshair"}}
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div style={{
        position:"fixed", top:10, left:10,
        background:"rgba(255,255,255,0.8)",
        padding:5, borderRadius:5,
        display:"flex", gap:5
      }}>
        {COLORS.map(c=>(
          <div key={c} onClick={()=>setSelectedColor(c)}
            style={{
              width:24, height:24, background:c,
              border:selectedColor===c?"3px solid black":"1px solid #999",
              cursor:"pointer"
            }}/>
        ))}
      </div>
    </>
  );
}
