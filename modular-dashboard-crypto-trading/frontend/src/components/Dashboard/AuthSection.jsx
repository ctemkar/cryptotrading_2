// components/Dashboard/AuthSection.jsx
import React, { useEffect } from 'react';

const AuthSection = ({ handleGoogleCallback, setIsAuthenticated, setUserInfo, setIsLoadingAuth }) => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      const savedUser = localStorage.getItem('googleUser');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setUserInfo(user);
          setIsAuthenticated(true);
        } catch (e) {
          console.error('Failed to parse saved user:', e);
        }
      }
      setIsLoadingAuth(false);

      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: '157143841270-n05ehn5d303vaije4bgg8gp3392l64ve.apps.googleusercontent.com',
          callback: handleGoogleCallback
        });
      }
    };

    return () => {
      document.body.removeChild(script);
    };
  }, [handleGoogleCallback, setIsAuthenticated, setUserInfo, setIsLoadingAuth]);

  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.renderButton(
        document.getElementById('googleSignInButton'),
        {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280
        }
      );
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '50px 40px',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📈</div>
        <h1 style={{ fontSize: '28px', marginBottom: '10px', color: '#333' }}>
          Crypto Trading Dashboard
        </h1>
        <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px' }}>
          Sign in with Google to access your trading dashboard
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div id="googleSignInButton"></div>
        </div>

        <div style={{ fontSize: '12px', color: '#999', marginTop: '30px', lineHeight: '1.6' }}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </div>
      </div>
    </div>
  );
};

export default AuthSection;