"use client";

import React, { useRef, useState, useEffect } from "react";
import { Brush, Eraser, Trash2, X, Check } from "lucide-react";

interface AvatarEditorProps {
  initialImage?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export function AvatarEditor({ initialImage, onSave, onClose }: AvatarEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(8);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fill with solid white background initially
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If there is an initial image, draw it onto the canvas
    if (initialImage) {
      const img = new Image();
      img.src = initialImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
    }
  }, [initialImage]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const { x, y } = getEventCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = isEraser ? "#FFFFFF" : color;
    ctx.lineWidth = brushSize;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getEventCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getEventCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Check if TouchEvent
    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  const colors = [
    "#000000", // Black
    "#ef4444", // Red
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Yellow
    "#a855f7", // Purple
    "#ec4899", // Pink
    "#f97316", // Orange
  ];

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>직접 그리는 프로필 이미지</h3>
          <button onClick={onClose} style={styles.closeIconBtn}>
            <X size={20} />
          </button>
        </div>

        <div style={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={styles.canvas}
          />
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          {/* Colors */}
          <div style={styles.colorPalette}>
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setIsEraser(false);
                }}
                style={{
                  ...styles.colorButton,
                  backgroundColor: c,
                  border: color === c && !isEraser ? "2px solid #ffffff" : "2px solid rgba(0,0,0,0.1)",
                  transform: color === c && !isEraser ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
            
            {/* Custom Color Picker */}
            <div style={styles.colorPickerWrapper}>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setIsEraser(false);
                }}
                style={styles.customColorInput}
              />
              <div
                style={{
                  ...styles.colorButton,
                  backgroundColor: colors.includes(color) ? "transparent" : color,
                  border: !colors.includes(color) && !isEraser ? "2px solid #ffffff" : "2px solid rgba(255,255,255,0.2)",
                  backgroundImage: colors.includes(color) ? "linear-gradient(to bottom right, #ff0000, #00ff00, #0000ff)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  cursor: "pointer",
                }}
              >
                +
              </div>
            </div>
          </div>

          {/* Tools */}
          <div style={styles.toolsRow}>
            <button
              onClick={() => setIsEraser(false)}
              style={{
                ...styles.toolBtn,
                ...( !isEraser ? styles.toolBtnActive : {} ),
              }}
            >
              <Brush size={18} />
              <span>브러쉬</span>
            </button>

            <button
              onClick={() => setIsEraser(true)}
              style={{
                ...styles.toolBtn,
                ...( isEraser ? styles.toolBtnActive : {} ),
              }}
            >
              <Eraser size={18} />
              <span>지우개</span>
            </button>

            <button onClick={clearCanvas} style={styles.toolBtn}>
              <Trash2 size={18} />
              <span>초기화</span>
            </button>
          </div>

          {/* Brush Size Slider */}
          <div style={styles.sliderContainer}>
            <label style={styles.label}>크기: {brushSize}px</label>
            <input
              type="range"
              min={2}
              max={24}
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              style={styles.slider}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelBtn}>
            취소
          </button>
          <button onClick={handleSave} style={styles.saveBtn}>
            <Check size={18} />
            <span>프로필 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    padding: "20px",
  },
  modal: {
    width: "100%",
    maxWidth: "340px",
    background: "#1e293b",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    padding: "24px",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: "16px",
    fontWeight: "bold",
  },
  closeIconBtn: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
  },
  canvasContainer: {
    display: "flex",
    justifyContent: "center",
    background: "#0f172a",
    padding: "12px",
    borderRadius: "12px",
  },
  canvas: {
    borderRadius: "8px",
    cursor: "crosshair",
    touchAction: "none", // Prevent page scrolling while drawing
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  toolbar: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  colorPalette: {
    display: "flex",
    justifyContent: "space-between",
    gap: "6px",
  },
  colorButton: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    cursor: "pointer",
    transition: "transform 0.15s",
    boxSizing: "border-box",
  },
  toolsRow: {
    display: "flex",
    gap: "8px",
  },
  toolBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "#cbd5e1",
    padding: "8px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  toolBtnActive: {
    background: "#6366f1",
    color: "#ffffff",
    borderColor: "#6366f1",
  },
  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  label: {
    fontSize: "12px",
    color: "#94a3b8",
    width: "70px",
  },
  slider: {
    flex: 1,
    accentColor: "#6366f1",
  },
  footer: {
    display: "flex",
    gap: "12px",
    marginTop: "4px",
  },
  cancelBtn: {
    flex: 1,
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "#cbd5e1",
    padding: "10px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  saveBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
    border: "none",
    borderRadius: "8px",
    color: "#ffffff",
    padding: "10px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  colorPickerWrapper: {
    position: "relative",
    width: "28px",
    height: "28px",
  },
  customColorInput: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
    zIndex: 2,
  },
};
