import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/auth/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { APP_BASENAME } from "@/lib/paths";
import { DashboardPage } from "@/pages/DashboardPage";
import { ActionPage } from "@/pages/ActionPage";
import { LoginPage } from "@/pages/LoginPage";
import { MyRequestsPage } from "@/pages/MyRequestsPage";
import {
  AllRequestsPage,
  ApprovalQueuePage,
  PaymentQueuePage,
  PrintQueuePage,
} from "@/pages/QueuePages";
import { RequestDetailPage } from "@/pages/RequestDetailPage";
import { RequestFormPage } from "@/pages/RequestFormPage";
import { UsersPage } from "@/pages/UsersPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={APP_BASENAME}>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/action/:token" element={<ActionPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/requests/new"
              element={
                <RequireAuth roles={["initiator"]}>
                  <RequestFormPage />
                </RequireAuth>
              }
            />
            <Route
              path="/requests/:id/edit"
              element={
                <RequireAuth roles={["initiator"]}>
                  <RequestFormPage />
                </RequireAuth>
              }
            />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route
              path="/my-requests"
              element={
                <RequireAuth roles={["initiator"]}>
                  <MyRequestsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/queues/approval"
              element={
                <RequireAuth roles={["approver_fred", "approver_anton"]}>
                  <ApprovalQueuePage />
                </RequireAuth>
              }
            />
            <Route
              path="/queues/payment"
              element={
                <RequireAuth roles={["finance"]}>
                  <PaymentQueuePage />
                </RequireAuth>
              }
            />
            <Route
              path="/queues/print"
              element={
                <RequireAuth roles={["admin"]}>
                  <PrintQueuePage />
                </RequireAuth>
              }
            />
            <Route
              path="/all-requests"
              element={
                <RequireAuth roles={["admin"]}>
                  <AllRequestsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAuth roles={["admin"]}>
                  <UsersPage />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
