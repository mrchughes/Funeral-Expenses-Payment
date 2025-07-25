// Utility functions for application API

// Use backend API URL directly for production and dev
const API_URL = process.env.REACT_APP_API_URL || "/api";

export async function createApplication(formData, token) {
    console.log(`[APPLICATION API] Creating new application`);

    try {
        const response = await fetch(`${API_URL}/application`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ formData })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APPLICATION API] Create error: ${response.status}, ${errorText}`);
            throw new Error(`Failed to create application: ${errorText || 'Server error'}`);
        }

        const data = await response.json();
        console.log(`[APPLICATION API] Created application: ${data.applicationId}`);
        return data;
    } catch (error) {
        console.error(`[APPLICATION API] Create error:`, error);
        throw error;
    }
}

export async function getApplicationById(applicationId, token) {
    console.log(`[APPLICATION API] Getting application: ${applicationId}`);

    try {
        const response = await fetch(`${API_URL}/application/${encodeURIComponent(applicationId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APPLICATION API] Get error: ${response.status}, ${errorText}`);
            throw new Error(`Failed to get application: ${errorText || 'Server error'}`);
        }

        const data = await response.json();
        console.log(`[APPLICATION API] Retrieved application: ${data.applicationId}`);
        return data;
    } catch (error) {
        console.error(`[APPLICATION API] Get error:`, error);
        throw error;
    }
}

export async function getUserApplications(token) {
    console.log(`[APPLICATION API] Getting user applications`);

    try {
        const response = await fetch(`${API_URL}/application`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APPLICATION API] List error: ${response.status}, ${errorText}`);
            throw new Error(`Failed to get applications: ${errorText || 'Server error'}`);
        }

        const data = await response.json();
        console.log(`[APPLICATION API] Retrieved ${data.length} applications`);
        return data;
    } catch (error) {
        console.error(`[APPLICATION API] List error:`, error);
        throw error;
    }
}

export async function updateApplication(applicationId, formData, token) {
    console.log(`[APPLICATION API] Updating application: ${applicationId}`);

    try {
        const response = await fetch(`${API_URL}/application/${encodeURIComponent(applicationId)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ formData })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APPLICATION API] Update error: ${response.status}, ${errorText}`);
            throw new Error(`Failed to update application: ${errorText || 'Server error'}`);
        }

        const data = await response.json();
        console.log(`[APPLICATION API] Updated application: ${data.applicationId}`);
        return data;
    } catch (error) {
        console.error(`[APPLICATION API] Update error:`, error);
        throw error;
    }
}

export async function submitApplication(applicationId, token) {
    console.log(`[APPLICATION API] Submitting application: ${applicationId}`);

    try {
        const response = await fetch(`${API_URL}/application/${encodeURIComponent(applicationId)}/submit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APPLICATION API] Submit error: ${response.status}, ${errorText}`);
            throw new Error(`Failed to submit application: ${errorText || 'Server error'}`);
        }

        const data = await response.json();
        console.log(`[APPLICATION API] Submitted application: ${data.applicationId}`);
        return data;
    } catch (error) {
        console.error(`[APPLICATION API] Submit error:`, error);
        throw error;
    }
}
