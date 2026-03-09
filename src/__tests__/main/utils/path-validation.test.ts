/**
 * Tests for src/main/utils/path-validation.ts
 */

import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs/promises';
import {
	normalizeApprovalPath,
	normalizeApprovalPathSync,
	isSystemPath,
	isWithinProjectScope,
} from '../../../main/utils/path-validation';

vi.mock('fs/promises', () => ({
	realpath: vi.fn(),
}));

const HOME = os.homedir();

describe('path-validation', () => {
	describe('normalizeApprovalPathSync', () => {
		it('expands tilde to home directory', () => {
			const result = normalizeApprovalPathSync('~/projects/foo', '/tmp/cwd');
			expect(result).toBe(`${HOME}/projects/foo`);
		});

		it('resolves relative paths against CWD', () => {
			const result = normalizeApprovalPathSync('../sibling', '/home/user/project');
			expect(result).toBe('/home/user/sibling');
		});

		it('passes through absolute paths unchanged', () => {
			const result = normalizeApprovalPathSync('/home/user/data', '/tmp/cwd');
			expect(result).toBe('/home/user/data');
		});

		it('resolves dot-dot traversal', () => {
			const result = normalizeApprovalPathSync('../..', '/home/user/project');
			expect(result).toBe('/home');
		});

		it('resolves current directory reference', () => {
			const result = normalizeApprovalPathSync('.', '/home/user/project');
			expect(result).toBe('/home/user/project');
		});
	});

	describe('normalizeApprovalPath (async)', () => {
		it('expands tilde and resolves', async () => {
			vi.mocked(fs.realpath).mockRejectedValueOnce(new Error('ENOENT'));
			const result = await normalizeApprovalPath('~/projects/foo', '/tmp/cwd');
			expect(result.normalized).toBe(`${HOME}/projects/foo`);
		});

		it('returns symlinkTarget when realpath differs', async () => {
			vi.mocked(fs.realpath).mockResolvedValueOnce('/real/target/path' as never);
			const result = await normalizeApprovalPath('/some/link', '/tmp/cwd');
			expect(result.symlinkTarget).toBe('/real/target/path');
			expect(result.normalized).toBe('/real/target/path');
		});

		it('omits symlinkTarget when realpath matches', async () => {
			vi.mocked(fs.realpath).mockResolvedValueOnce('/some/path' as never);
			const result = await normalizeApprovalPath('/some/path', '/tmp/cwd');
			expect(result.symlinkTarget).toBeUndefined();
		});

		it('falls back gracefully when realpath fails', async () => {
			vi.mocked(fs.realpath).mockRejectedValueOnce(new Error('ENOENT'));
			const result = await normalizeApprovalPath('/nonexistent/path', '/tmp/cwd');
			expect(result.normalized).toBe('/nonexistent/path');
			expect(result.symlinkTarget).toBeUndefined();
		});
	});

	describe('isSystemPath', () => {
		// POSIX system paths
		it('rejects root /', () => {
			expect(isSystemPath('/')).toBe(true);
		});

		it('rejects /etc', () => {
			expect(isSystemPath('/etc')).toBe(true);
		});

		it('rejects /etc/subdir', () => {
			expect(isSystemPath('/etc/nginx')).toBe(true);
		});

		it('rejects /usr', () => {
			expect(isSystemPath('/usr')).toBe(true);
		});

		it('rejects /usr/local/bin', () => {
			expect(isSystemPath('/usr/local/bin')).toBe(true);
		});

		it('rejects /var', () => {
			expect(isSystemPath('/var')).toBe(true);
		});

		it('rejects /root', () => {
			expect(isSystemPath('/root')).toBe(true);
		});

		it('rejects /bin', () => {
			expect(isSystemPath('/bin')).toBe(true);
		});

		it('rejects /boot', () => {
			expect(isSystemPath('/boot')).toBe(true);
		});

		it('rejects /dev', () => {
			expect(isSystemPath('/dev')).toBe(true);
		});

		it('rejects /proc', () => {
			expect(isSystemPath('/proc')).toBe(true);
		});

		it('rejects /sys', () => {
			expect(isSystemPath('/sys')).toBe(true);
		});

		// Paths under root but in user space
		it('allows /home/user', () => {
			expect(isSystemPath('/home/user')).toBe(false);
		});

		it('allows /home/user/project', () => {
			expect(isSystemPath('/home/user/project')).toBe(false);
		});

		it('allows /Users/user (macOS)', () => {
			expect(isSystemPath('/Users/user')).toBe(false);
		});

		it('allows /tmp/data', () => {
			expect(isSystemPath('/tmp/data')).toBe(false);
		});

		// Trailing slashes
		it('strips trailing slashes before checking', () => {
			expect(isSystemPath('/etc/')).toBe(true);
			expect(isSystemPath('/home/user/')).toBe(false);
		});

		// Windows paths
		it('rejects Windows drive root C:\\', () => {
			expect(isSystemPath('C:\\')).toBe(true);
		});

		it('rejects bare Windows drive C:', () => {
			expect(isSystemPath('C:')).toBe(true);
		});

		it('rejects C:\\Windows', () => {
			expect(isSystemPath('C:\\Windows')).toBe(true);
		});

		it('rejects C:\\Windows\\System32', () => {
			expect(isSystemPath('C:\\Windows\\System32')).toBe(true);
		});

		it('rejects C:\\System32', () => {
			expect(isSystemPath('C:\\System32')).toBe(true);
		});

		it('rejects C:\\Program Files', () => {
			expect(isSystemPath('C:\\Program Files')).toBe(true);
		});

		it('allows C:\\Users\\dev\\project', () => {
			expect(isSystemPath('C:\\Users\\dev\\project')).toBe(false);
		});

		it('allows D:\\projects', () => {
			expect(isSystemPath('D:\\projects')).toBe(false);
		});
	});

	describe('isWithinProjectScope', () => {
		it('returns true for path under project CWD', () => {
			expect(isWithinProjectScope(`${HOME}/project/src`, `${HOME}/project`)).toBe(true);
		});

		it('returns true for exact project CWD', () => {
			expect(isWithinProjectScope(`${HOME}/project`, `${HOME}/project`)).toBe(true);
		});

		it('returns true for path under home directory', () => {
			expect(isWithinProjectScope(`${HOME}/other-project`, '/opt/elsewhere')).toBe(true);
		});

		it('returns false for path outside project and home', () => {
			expect(isWithinProjectScope('/tmp/random', `${HOME}/project`)).toBe(false);
		});

		it('returns true for sibling directory (under homedir)', () => {
			expect(isWithinProjectScope(`${HOME}/other-project`, `${HOME}/project`)).toBe(true);
		});

		it('returns false for completely unrelated path outside home', () => {
			expect(isWithinProjectScope('/opt/data', `${HOME}/project`)).toBe(false);
		});

		it('does not match CWD prefix without separator', () => {
			// project-evil is NOT under project, but IS under homedir
			expect(isWithinProjectScope(`${HOME}/project-evil`, `${HOME}/project`)).toBe(true);
		});

		it('rejects path outside both CWD and home', () => {
			expect(isWithinProjectScope('/mnt/external', `${HOME}/project`)).toBe(false);
		});
	});
});
