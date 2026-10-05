import { useState, useEffect, useCallback } from 'react';
import { 
  Server, 
  Database, 
  Activity, 
  RefreshCw, 
  Layers, 
  Terminal, 
  CheckCircle2, 
  XCircle,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface HealthData {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  redis: string;
  uptime: number;
  error?: string;
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Attempt proxy first (/api/health), fallback to direct port 3001
      const res = await fetch('/api/health').catch(() => fetch('http://localhost:3001/health'));
      const data = await res.json();
      setHealth(data);
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status} returned from health endpoint`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend';
      setError(msg);
      setHealth(null);
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const isHealthy = health?.status === 'healthy';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      {/* Top Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '3rem',
        paddingBottom: '1.5rem',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)'
          }}>
            <Layers color="#ffffff" size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>INSPECTR</h1>
              <span className="badge badge-info">v0.1.0 (Stage 1)</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Amazon SQS Simulation Platform • Visual DLQ Inspector & Replay Engine
            </p>
          </div>
        </div>

        <button 
          onClick={checkHealth}
          disabled={loading}
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '0.625rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            transition: 'all 0.2s ease',
          }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Refresh Health</span>
        </button>
      </header>

      {/* Main Status Grid */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} color="var(--accent-cyan)" />
          System Health & Environment Status
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {/* Backend API Card */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)' }}>
                  <Server size={20} color="var(--accent-cyan)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Backend API</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hono / Bun Server (:3001)</span>
                </div>
              </div>
              <span className={`badge ${health ? (isHealthy ? 'badge-healthy' : 'badge-unhealthy') : 'badge-checking'}`}>
                <span className="pulse-dot" style={{ backgroundColor: isHealthy ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}></span>
                {health ? health.status : 'Connecting...'}
              </span>
            </div>
            
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Service:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{health?.service || 'inspectr-api'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Process Uptime:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {health?.uptime !== undefined ? `${health.uptime}s` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Redis Cluster Card */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)' }}>
                  <Database size={20} color="#f87171" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Redis Storage Engine</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Podman Container (:6379)</span>
                </div>
              </div>
              <span className={`badge ${health?.redis === 'connected' ? 'badge-healthy' : 'badge-unhealthy'}`}>
                {health?.redis === 'connected' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {health?.redis || 'disconnected'}
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ping Check:</span>
                <span style={{ color: health?.redis === 'connected' ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 600 }}>
                  {health?.redis === 'connected' ? 'PONG (active)' : 'Unreachable'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Client Driver:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>ioredis singleton</span>
              </div>
            </div>
          </div>

          {/* Environment Card */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)' }}>
                  <Terminal size={20} color="var(--accent-purple)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Runtime Environment</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fedora Linux • Bun Monorepo</span>
                </div>
              </div>
              <span className="badge badge-info">
                <ShieldCheck size={13} />
                Verified
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Workspaces:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>@inspectr/server, @inspectr/web</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Last Polled:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {lastChecked.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ 
            marginTop: '1.25rem', 
            padding: '1rem 1.25rem', 
            background: 'rgba(239, 68, 68, 0.12)', 
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <XCircle size={18} />
            <span>Connection Issue: {error}</span>
          </div>
        )}
      </section>

      {/* Live Health Payload Viewer */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} color="var(--accent-cyan)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Raw Health Endpoint Response (GET /health)</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              HTTP {isHealthy ? '200 OK' : '503 Service Unavailable'}
            </span>
          </div>
          <pre style={{
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.85rem',
            color: '#38bdf8',
            overflowX: 'auto',
            lineHeight: 1.6
          }}>
            {health ? JSON.stringify(health, null, 2) : '/* Waiting for server response... */'}
          </pre>
        </div>
      </section>

      {/* Platform Roadmap / Modules Preview */}
      <section>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Inspectr Core Modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '0.35rem' }}>SQS Message Broker</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Standard and FIFO queues with visibility timeouts, delay queues, and in-flight message state machine.
            </p>
          </div>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, color: '#f87171', marginBottom: '0.35rem' }}>Visual DLQ Inspector</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Deep message payload inspection, failure stack trace analysis, and redrive policy tracking.
            </p>
          </div>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, color: '#a78bfa', marginBottom: '0.35rem' }}>Replay Engine</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Selective and batch replay into source or destination queues with header mutations and dry-run testing.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
