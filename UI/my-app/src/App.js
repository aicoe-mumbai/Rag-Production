// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboards';
import AdminDashboard from './components/Admin';
import Landing from './components/Landing';
import NotFound from './components/NotFound';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('authToken');
  });

  const [username, setUsername] = useState(() => {
    return sessionStorage.getItem('userName') || "";
  });

  useEffect(() => {
    // Keep this in case the token updates later
    const token = sessionStorage.getItem('authToken');
    const user = sessionStorage.getItem('userName');
    setIsAuthenticated(!!token);
    setUsername(user || "");
  }, []);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Navigate to="/landing" replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/landing" replace />
            ) : (
              <Login onLogin={() => setIsAuthenticated(true)} setUsername={setUsername} />
            )
          }
        />
        <Route
          path="/landing"
          element={
            isAuthenticated ? (
              <Landing username={username} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/qa/dashboard"
          element={
            isAuthenticated ? (
              <Dashboard onLogout={() => setIsAuthenticated(false)} username={username} setUsername={setUsername} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/qa/admin"
          element={<AdminDashboard />}
        />
        <Route
          path="/chat/dashboard"
          element={
            isAuthenticated ? (
              <Dashboard onLogout={() => setIsAuthenticated(false)} username={username} setUsername={setUsername} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;








