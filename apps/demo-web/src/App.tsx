import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import ImageStudio from "@/pages/ImageStudio";
import { lazy, Suspense } from "react";
const ModelComparison = lazy(() => import("@/pages/ModelComparison"));
const ModelUsage = lazy(() => import("@/pages/ModelUsage"));
const ModelConfigs = lazy(() => import("@/pages/ModelConfigs"));
import "@/navigation.css";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="app-nav" aria-label="主导航">
        <span className="app-nav-brand">✳ AI 实验室</span>
        <div className="app-nav-links">
          <NavLink to="/images">图片生成</NavLink>
          <NavLink to="/model-comparison">模型参数对比</NavLink>
          <NavLink to="/model-configs">模型配置</NavLink>
          <NavLink to="/model-usage">模型用量监控</NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/images" replace />} />
        <Route path="/images" element={<ImageStudio />} />
        <Route
          path="/model-comparison"
          element={
            <Suspense fallback={<div>正在加载页面…</div>}>
              <ModelComparison />
            </Suspense>
          }
        />
        <Route
          path="/model-usage"
          element={
            <Suspense fallback={<div>正在加载页面…</div>}>
              <ModelUsage />
            </Suspense>
          }
        />
        <Route
          path="/model-configs"
          element={
            <Suspense fallback={<div>正在加载页面…</div>}>
              <ModelConfigs />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/images" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
