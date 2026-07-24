import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MobileShell } from './components/MobileShell';

// Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Suppliers } from './pages/Suppliers';
import { Warehouses } from './pages/Warehouses';
import { Inventory } from './pages/Inventory';
import { Factories } from './pages/Factories';
import { Requests } from './pages/Requests';
import { Customers } from './pages/Customers';
import { Assistant } from './pages/Assistant';
import { Analytics } from './pages/Analytics';
import { Simulation } from './pages/Simulation';
import { Alerts } from './pages/Alerts';
import { Signals } from './pages/Signals';
import { Profile } from './pages/Profile';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Guard component to enforce authentication and profile approval
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[13px] text-muted-foreground font-mono">Authenticating session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if profile exists and is approved (admins bypass approval desk)
  const isApproved = profile?.is_approved || isAdmin;
  if (!isApproved) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between p-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <div className="mono-label !text-primary">§ Under review</div>
          <h1 className="mt-3 font-display text-[26px] font-medium leading-[1.2]">
            Enrolment pending approval from the trust desk
          </h1>
          <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
            Your organization details are being verified. Access will unlock automatically once review completes.
          </p>
          <button
            onClick={signOut}
            className="mt-8 border border-border py-2.5 rounded-md text-[13px] font-medium hover:bg-surface transition-colors"
          >
            Sign out
          </button>
        </div>
        <div className="text-center pt-8 border-t border-border text-[10px] uppercase tracking-wider text-muted-foreground">
          Global-Chain Trust Desk
        </div>
      </div>
    );
  }

  return <MobileShell>{children}</MobileShell>;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Authenticated & Approved Routes */}
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
            <Route path="/suppliers" element={<AuthGuard><Suppliers /></AuthGuard>} />
            <Route path="/customers" element={<AuthGuard><Customers /></AuthGuard>} />
            <Route path="/requests" element={<AuthGuard><Requests /></AuthGuard>} />
            <Route path="/simulation" element={<AuthGuard><Simulation /></AuthGuard>} />
            <Route path="/assistant" element={<AuthGuard><Assistant /></AuthGuard>} />
            <Route path="/warehouses" element={<AuthGuard><Warehouses /></AuthGuard>} />
            <Route path="/factories" element={<AuthGuard><Factories /></AuthGuard>} />
            <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
            <Route path="/alerts" element={<AuthGuard><Alerts /></AuthGuard>} />
            <Route path="/signals" element={<AuthGuard><Signals /></AuthGuard>} />
            <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
