import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { AppBridgeProvider } from './components/AppBridgeProvider.tsx'

import "./main-simple.css"

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <AppBridgeProvider>
      <App />
    </AppBridgeProvider>
   </ErrorBoundary>
)
