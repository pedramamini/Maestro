/**
 * SshRemoteModal - Modal for adding/editing SSH remote configurations
 *
 * This modal provides a form for configuring SSH remotes that can be used
 * to execute AI agents on remote hosts. Supports:
 * - Host/port configuration
 * - Username and private key path
 * - Optional remote working directory
 * - Environment variables for remote execution
 * - Connection testing before saving
 *
 * Usage:
 * ```tsx
 * <SshRemoteModal
 *   theme={theme}
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   onSave={handleSaveConfig}
 *   initialConfig={editingConfig} // Optional for editing
 * />
 * ```
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { Theme } from '../../types';
import type { SshRemoteConfig, SshRemoteTestResult } from '../../../shared/types';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { Modal, ModalFooter } from '../ui/Modal';
import { FormInput } from '../ui/FormInput';

/**
 * Environment variable entry with stable ID for editing
 */
interface EnvVarEntry {
  id: number;
  key: string;
  value: string;
}

export interface SshRemoteModalProps {
  /** Theme object for styling */
  theme: Theme;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when configuration is saved. Returns the saved config or error */
  onSave: (config: Partial<SshRemoteConfig>) => Promise<{
    success: boolean;
    config?: SshRemoteConfig;
    error?: string;
  }>;
  /** Optional callback to test connection before saving */
  onTestConnection?: (config: SshRemoteConfig) => Promise<{
    success: boolean;
    result?: SshRemoteTestResult;
    error?: string;
  }>;
  /** Optional initial configuration for editing */
  initialConfig?: SshRemoteConfig;
  /** Modal title override */
  title?: string;
}

/**
 * Convert environment variable object to array with stable IDs
 */
function envVarsToArray(envVars?: Record<string, string>): EnvVarEntry[] {
  if (!envVars) return [];
  return Object.entries(envVars).map(([key, value], index) => ({
    id: index,
    key,
    value,
  }));
}

/**
 * Convert environment variable array back to object
 */
function envVarsToObject(entries: EnvVarEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  entries.forEach((entry) => {
    if (entry.key.trim()) {
      result[entry.key] = entry.value;
    }
  });
  return result;
}

export function SshRemoteModal({
  theme,
  isOpen,
  onClose,
  onSave,
  onTestConnection,
  initialConfig,
  title,
}: SshRemoteModalProps) {
  // Form state
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [remoteWorkingDir, setRemoteWorkingDir] = useState('');
  const [envVars, setEnvVars] = useState<EnvVarEntry[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [nextEnvVarId, setNextEnvVarId] = useState(0);

  // UI state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    hostname?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEnvVars, setShowEnvVars] = useState(false);

  // Refs
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens/closes or initialConfig changes
  useEffect(() => {
    if (isOpen) {
      if (initialConfig) {
        setName(initialConfig.name);
        setHost(initialConfig.host);
        setPort(String(initialConfig.port));
        setUsername(initialConfig.username);
        setPrivateKeyPath(initialConfig.privateKeyPath);
        setRemoteWorkingDir(initialConfig.remoteWorkingDir || '');
        const entries = envVarsToArray(initialConfig.remoteEnv);
        setEnvVars(entries);
        setNextEnvVarId(entries.length);
        setEnabled(initialConfig.enabled);
        setShowEnvVars(entries.length > 0);
      } else {
        // Reset to defaults for new config
        setName('');
        setHost('');
        setPort('22');
        setUsername('');
        setPrivateKeyPath('');
        setRemoteWorkingDir('');
        setEnvVars([]);
        setNextEnvVarId(0);
        setEnabled(true);
        setShowEnvVars(false);
      }
      setError(null);
      setTestResult(null);
    }
  }, [isOpen, initialConfig]);

  // Validation
  const validateForm = useCallback((): string | null => {
    if (!name.trim()) return 'Name is required';
    if (!host.trim()) return 'Host is required';
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return 'Port must be between 1 and 65535';
    }
    if (!username.trim()) return 'Username is required';
    if (!privateKeyPath.trim()) return 'Private key path is required';
    return null;
  }, [name, host, port, username, privateKeyPath]);

  const isValid = validateForm() === null;

  // Build config object from form state
  const buildConfig = useCallback((): SshRemoteConfig => {
    return {
      id: initialConfig?.id || '',
      name: name.trim(),
      host: host.trim(),
      port: parseInt(port, 10),
      username: username.trim(),
      privateKeyPath: privateKeyPath.trim(),
      remoteWorkingDir: remoteWorkingDir.trim() || undefined,
      remoteEnv: Object.keys(envVarsToObject(envVars)).length > 0
        ? envVarsToObject(envVars)
        : undefined,
      enabled,
    };
  }, [initialConfig, name, host, port, username, privateKeyPath, remoteWorkingDir, envVars, enabled]);

  // Handle save
  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const config = buildConfig();
      const result = await onSave(config);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Handle test connection
  const handleTestConnection = async () => {
    if (!onTestConnection) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const config = buildConfig();
      const result = await onTestConnection(config);
      if (result.success && result.result) {
        setTestResult({
          success: true,
          message: 'Connection successful!',
          hostname: result.result.remoteInfo?.hostname,
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Connection failed',
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  // Environment variable handlers
  const addEnvVar = () => {
    setEnvVars((prev) => [...prev, { id: nextEnvVarId, key: '', value: '' }]);
    setNextEnvVarId((prev) => prev + 1);
    setShowEnvVars(true);
  };

  const updateEnvVar = (id: number, field: 'key' | 'value', value: string) => {
    setEnvVars((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const removeEnvVar = (id: number) => {
    setEnvVars((prev) => prev.filter((entry) => entry.id !== id));
  };

  if (!isOpen) return null;

  const modalTitle = title || (initialConfig ? 'Edit SSH Remote' : 'Add SSH Remote');

  return (
    <Modal
      theme={theme}
      title={modalTitle}
      priority={MODAL_PRIORITIES.SSH_REMOTE}
      onClose={onClose}
      width={500}
      headerIcon={<Server className="w-4 h-4" style={{ color: theme.colors.accent }} />}
      initialFocusRef={nameInputRef as React.RefObject<HTMLElement>}
      footer={
        <div className="flex items-center gap-2 w-full">
          {/* Test Connection Button */}
          {onTestConnection && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !isValid}
              className="px-3 py-2 rounded border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textMain,
                backgroundColor: 'transparent',
              }}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
          )}
          <div className="flex-1" />
          <ModalFooter
            theme={theme}
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel={saving ? 'Saving...' : 'Save'}
            confirmDisabled={!isValid || saving}
          />
        </div>
      }
    >
      <div className="space-y-4">
        {/* Error Message */}
        {error && (
          <div
            className="p-3 rounded flex items-start gap-2 text-sm"
            style={{
              backgroundColor: theme.colors.error + '20',
              color: theme.colors.error,
            }}
          >
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className="p-3 rounded flex items-start gap-2 text-sm"
            style={{
              backgroundColor: testResult.success
                ? theme.colors.success + '20'
                : theme.colors.error + '20',
              color: testResult.success ? theme.colors.success : theme.colors.error,
            }}
          >
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <div>{testResult.message}</div>
              {testResult.hostname && (
                <div className="text-xs mt-1 opacity-80">
                  Remote hostname: {testResult.hostname}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Name */}
        <FormInput
          ref={nameInputRef}
          theme={theme}
          label="Display Name"
          value={name}
          onChange={setName}
          placeholder="My Remote Server"
          helperText="A friendly name to identify this remote configuration"
        />

        {/* Host and Port */}
        <div className="flex gap-3">
          <div className="flex-1">
            <FormInput
              theme={theme}
              label="Host"
              value={host}
              onChange={setHost}
              placeholder="192.168.1.100 or server.example.com"
              monospace
            />
          </div>
          <div className="w-24">
            <FormInput
              theme={theme}
              label="Port"
              value={port}
              onChange={setPort}
              placeholder="22"
              monospace
            />
          </div>
        </div>

        {/* Username */}
        <FormInput
          theme={theme}
          label="Username"
          value={username}
          onChange={setUsername}
          placeholder="username"
          monospace
        />

        {/* Private Key Path */}
        <FormInput
          theme={theme}
          label="Private Key Path"
          value={privateKeyPath}
          onChange={setPrivateKeyPath}
          placeholder="~/.ssh/id_ed25519"
          monospace
          helperText="Path to your SSH private key file (password-protected keys require ssh-agent)"
        />

        {/* Remote Working Directory (optional) */}
        <FormInput
          theme={theme}
          label="Remote Working Directory (optional)"
          value={remoteWorkingDir}
          onChange={setRemoteWorkingDir}
          placeholder="/home/user/projects"
          monospace
          helperText="Default directory on the remote host for agent execution"
        />

        {/* Environment Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-xs font-bold opacity-70 uppercase"
              style={{ color: theme.colors.textMain }}
            >
              Environment Variables (optional)
            </label>
            <button
              type="button"
              onClick={addEnvVar}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10 transition-colors"
              style={{ color: theme.colors.accent }}
            >
              <Plus className="w-3 h-3" />
              Add Variable
            </button>
          </div>

          {showEnvVars && envVars.length > 0 && (
            <div className="space-y-2 mb-2">
              {envVars.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => updateEnvVar(entry.id, 'key', e.target.value)}
                    placeholder="VARIABLE"
                    className="flex-1 p-2 rounded border bg-transparent outline-none text-xs font-mono"
                    style={{
                      borderColor: theme.colors.border,
                      color: theme.colors.textMain,
                    }}
                  />
                  <span className="text-xs" style={{ color: theme.colors.textDim }}>
                    =
                  </span>
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateEnvVar(entry.id, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-[2] p-2 rounded border bg-transparent outline-none text-xs font-mono"
                    style={{
                      borderColor: theme.colors.border,
                      color: theme.colors.textMain,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvVar(entry.id)}
                    className="p-2 rounded hover:bg-white/10 transition-colors"
                    title="Remove variable"
                    style={{ color: theme.colors.textDim }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs" style={{ color: theme.colors.textDim }}>
            Environment variables passed to agents running on this remote host
          </p>
        </div>

        {/* Enabled Toggle */}
        <div
          className="flex items-center justify-between p-3 rounded border"
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bgMain,
          }}
        >
          <div>
            <div className="font-medium text-sm" style={{ color: theme.colors.textMain }}>
              Enable this remote
            </div>
            <div className="text-xs" style={{ color: theme.colors.textDim }}>
              Disabled remotes won&apos;t be available for selection
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className="w-12 h-6 rounded-full transition-colors relative"
            style={{
              backgroundColor: enabled ? theme.colors.accent : theme.colors.bgActivity,
            }}
          >
            <div
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
              style={{
                transform: enabled ? 'translateX(26px)' : 'translateX(4px)',
              }}
            />
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default SshRemoteModal;
