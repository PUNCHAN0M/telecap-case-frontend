# TeleCap Frame Viewer - Frontend

## 📁 โครงสร้างไฟล์

```
src/
├── components/
│   └── frame-viewer/
│       ├── FrameViewer.tsx          # Container หลัก
│       ├── Timeline.tsx             # Canvas timeline (zoom/pan/seek)
│       ├── PlayerControls.tsx       # Play/Pause/Speed/Progress
│       ├── ProcessingOverlay.tsx    # "HLS Processing..." overlay
│       ├── NotAvailableOverlay.tsx  # Video not ready overlay
│       ├── ErrorOverlay.tsx         # Error + retry overlay
│       └── frame-viewer.css         # Styles
│
├── hooks/
│   ├── useVideoPlayer.ts            # hls.js + chunk fallback logic
│   ├── useTimeline.ts               # Zoom/pan/seek calculations
│   └── usePolling.ts                # Interval polling hook
│
├── api/
│   └── viewer.ts                    # API calls (getHlsStatus, seek, etc.)
│
├── types/
│   └── viewer.ts                    # TypeScript interfaces
│
└── pages/
    └── CaseVideoPage.tsx            # Page wrapper (React Router)
```

---

## 📦 Dependencies

```bash
npm install hls.js
npm install -D @types/hls.js
```

**Note:** ถ้าใช้ React Router:
```bash
npm install react-router-dom
```

---

## 🔌 API Integration

ต้องมี environment variable:
```env
VITE_CASE_SERVICE_URL=http://localhost:3000
```

---

## 🎮 Usage

### 1. ใช้กับ React Router
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CaseVideoPage } from './pages/CaseVideoPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cases/:caseId/videos/:videoId" element={<CaseVideoPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 2. ใช้เป็น Component ธรรมดา
```tsx
import { FrameViewer } from './components/frame-viewer/FrameViewer';

function MyPage() {
  return <FrameViewer videoId="550e8400-e29b-41d4-a716-446655440000" />;
}
```

---

## 🎯 Features

| Feature | Status | Description |
|---------|--------|-------------|
| HLS Streaming | ✅ | hls.js with adaptive bitrate |
| Chunk Fallback | ✅ | Play raw chunks if HLS not ready |
| Timeline | ✅ | Canvas-based, zoom 1x-64x |
| Seek | ✅ | Click timeline or drag progress bar |
| Zoom/Pan | ✅ | Mouse wheel + drag |
| Speed Control | ✅ | 0.5x - 8x |
| Fullscreen | ✅ | Fullscreen API |
| Auto-poll | ✅ | Poll every 10s when processing |
| Error Handling | ✅ | Retry + error overlays |

---

## 🎨 Customization

### CSS Variables
```css
.frame-viewer {
  --playhead: #ff4444;        /* สี playhead */
  --button-active: #ff4444;   /* สีปุ่ม active */
  --timeline-bg: #080808;     /* พื้นหลัง timeline */
}
```

### Timeline Zoom Levels
แก้ไขใน `Timeline.tsx`:
```tsx
const zoomLevels = [1, 2, 4, 8, 16, 32, 64];
```

### Polling Interval
แก้ไขใน `FrameViewer.tsx`:
```tsx
usePolling(() => { ... }, 10000, ...); // 10 seconds
```

---

## 🔮 Future Enhancements

| Feature | Phase | Description |
|---------|-------|-------------|
| Finding Overlay | 2 | แสดง bounding box บน video |
| Timeline Markers | 2 | แสดง findings บน timeline |
| Sync with Metadata | 2 | แสดง frame info ขณะเล่น |
| Thumbnail Preview | 3 | Hover ดู thumbnail |
| Multi-view | 3 | เปรียบเทียบหลาย video |
