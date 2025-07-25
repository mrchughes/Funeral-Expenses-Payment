// Fully implemented real code for frontend/src/auth/PrivateRoute.js
import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import AuthContext from "./AuthContext";

const PrivateRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);

    console.log("🛡️ PrivateRoute check:", { user: !!user, loading }); // Debug log

    if (loading) {
        return <div>Loading...</div>;
    }

    return user ? children : <Navigate to="/" />;
};

export default PrivateRoute;
