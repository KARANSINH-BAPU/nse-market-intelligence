"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Dashboard } from "@/components/views/Dashboard";

export default function HomePage() {
  return (
    <>
      <Sidebar />
      <div className="kp-main">
        <Header />
        <div className="kp-content">
          <Dashboard />
        </div>
      </div>
    </>
  );
}
