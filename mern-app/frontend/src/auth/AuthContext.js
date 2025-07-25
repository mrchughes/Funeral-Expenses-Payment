// Fully implemented real code for frontend/src/auth/AuthContext.js
import React, { createContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Initialize user from localStorage
        try {
            const storedUser = localStorage.getItem("user");
            if (storedUser && storedUser !== "null") {
                const userData = JSON.parse(storedUser);
                // Validate token exists
                if (userData && userData.token) {
                    setUser(userData);
                }
            }
        } catch (error) {
            console.error("Error parsing user data from localStorage:", error);
            localStorage.removeItem("user");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Update localStorage when user changes
        if (user) {
            localStorage.setItem("user", JSON.stringify(user));
        } else {
            localStorage.removeItem("user");
        }
    }, [user]);

    const login = (userData) => {
        console.log("🔐 AuthContext login called with userData:", userData); // Debug log
        if (userData && userData.token) {
            console.log("🔐 AuthContext setting user and navigating to dashboard"); // Debug log
            setUser(userData);
            navigate("/dashboard");
        } else {
            console.error("🔐 AuthContext invalid user data for login - missing token or userData:", userData);
        }
    };

    const logout = () => {
        console.log("🔐 AuthContext logout called"); // Debug log
        setUser(null);
        localStorage.removeItem("user");
        navigate("/");
    };

    // Show loading state during initialization
    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
