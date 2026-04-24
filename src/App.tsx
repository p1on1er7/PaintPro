import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Scanner from "./pages/Scanner";
import Logistica from "./pages/Logistica";
import Preventivi from "./pages/Preventivi";
import Calendario from "./pages/Calendario";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Scanner /></ProtectedRoute>} />
            <Route path="/logistica" element={<ProtectedRoute><Logistica /></ProtectedRoute>} />
            <Route path="/preventivi" element={<ProtectedRoute><Preventivi /></ProtectedRoute>} />
            <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
