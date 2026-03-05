import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import { ErrorBoundary } from './shared/ErrorBoundary.tsx'
import { initErrorTracking } from './utils/errorTracking'
import { initAnalytics } from './utils/analytics'
import { initPerformanceTracking } from './utils/performance'
import { AnalyticsWrapper } from './shared/AnalyticsWrapper'
import { PageLoader } from './shared/PageLoader'

// Initialize monitoring services
initErrorTracking()
initAnalytics()
initPerformanceTracking()

// Lazy load routes for code splitting
const App = lazy(() => import('./App.tsx'))
const DataUsage = lazy(() => import('./pages/DataUsage.tsx'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AnalyticsWrapper>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<App />} />
                <Route path="/data-usage" element={<DataUsage />} />
                <Route path="/privacypolicy" element={<PrivacyPolicy />} />
              </Routes>
            </Suspense>
          </AnalyticsWrapper>
        </BrowserRouter>
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
)
