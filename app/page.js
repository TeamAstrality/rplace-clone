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

  // cooldown timer
  const [cooldown, setCooldown] = useState(false);
  const [timer, setTimer] = useState(0);

  // server uptime
  const [serverStartTime] = useState(Date.now());
  const [uptime, setUptime] = useState("0:00:00");

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

    // white background
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
  };

  const checkExpandGrid = () => {
    const totalPixels = gridSizeRef.current.width * gridSizeRef.current.height;
    const placedPixels = pixelsRef.current.length;

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

    // fetch pixels from Supabase
    supabase.from("pixels").select("*").then(({ data }) => {
      if(data && data.length>0){
        pixelsRef.current = data.map(p => ({ x: p.x, y: p.y, color: p.color }));
      } else {
        // test pixels
        pixelsRef.current = [
          { x:0, y:0, color:"#ff0000" },
          { x:1, y:0, color:"#00ff00" },
          { x:0, y:1, color:"#0000ff" },
          { x:1, y:1, color:"#ffff00" },
          { x:2, y:0, color:"#ffffff" },
          { x:2, y:1, color:"#000000" }
        ];
      }
      drawCanvas();
    });

    // Realtime updates
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

  // cooldown click handler
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

    // immediate local update
    const idx = pixelsRef.current.findIndex(p => p.x===ix && p.y===iy);
    if(idx>=0) pixelsRef.current[idx].color = selectedColor;
    else pixelsRef.current.push({ x: ix, y: iy, color: selectedColor });
    drawCanvas();
    checkExpandGrid();

    // send to Supabase
    supabase.from("pixels").upsert({ x: ix, y: iy, color: selectedColor });

    // start cooldown timer
    setCooldown(true);
    setTimer(60);
    const interval = setInterval(() => {
      setTimer(prev => {
        if(prev <= 1){
          clearInterval(interval);
          setCooldown(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleWheel = e => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    let newPixelSize = pixelSize * delta;

    // limit zoom out
    const minPixelSizeX = window.innerWidth / gridSizeRef.current.width;
    const minPixelSizeY = window.innerHeight / gridSizeRef.current.height;
    const minPixelSize = Math.min(minPixelSizeX, minPixelSizeY);

    newPixelSize = Math.max(newPixelSize, minPixelSize);
    newPixelSize = Math.min(newPixelSize, 50);

    // adjust offset so zoom centers on mouse
    const offsetX = mouseX - ((mouseX - offset.x) * newPixelSize) / pixelSize;
    const offsetY = mouseY - ((mouseY - offset.y) * newPixelSize) / pixelSize;

    setPixelSize(newPixelSize);
    setOffset({ x: offsetX, y: offsetY });
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

  // Server uptime timer
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - serverStartTime;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setUptime(`${hours}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [serverStartTime]);

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
      {/* Color Picker */}
      <div style={{
        position:"fixed",
        top:10, left:10,
        background:"rgba(255,255,255,0.9)",
        padding:5, borderRadius:5,
        display:"flex", flexDirection:"column", gap:5
      }}>
        <input type="color" value={selectedColor} onChange={e=>setSelectedColor(e.target.value)} style={{width:50,height:50,border:"1px solid #999"}}/>
        <input type="text" value={selectedColor} onChange={e=>setSelectedColor(e.target.value)} style={{width:70}}/>
        <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
          {COLORS.map(c=>(
            <div key={c} onClick={()=>setSelectedColor(c)}
              style={{width:24,height:24,background:c
