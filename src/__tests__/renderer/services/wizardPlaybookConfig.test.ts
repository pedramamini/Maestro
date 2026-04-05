import { describe, expect, it } from 'vitest';
import {
	buildWizardExecutionGraphPreview,
	buildWizardPlaybookDraft,
	buildWizardPlaybookPackDrafts,
} from '../../../renderer/services/wizardPlaybookConfig';

describe('wizardPlaybookConfig', () => {
	it('infers a setup root with middle fan-out and final join', () => {
		const documents = [
			{
				filename: 'Phase-01-Setup.md',
				content: '# Setup\n\n- [ ] Prepare the foundation',
			},
			{
				filename: 'Phase-02-Backend.md',
				content: '# Backend\n\n- [ ] Implement the backend work',
			},
			{
				filename: 'Phase-03-Frontend.md',
				content: '# Frontend\n\n- [ ] Implement the frontend work',
			},
			{
				filename: 'Phase-04-Integration-Review.md',
				content: '# Integration Review\n\n- [ ] Verify the full flow',
			},
		];

		const draft = buildWizardPlaybookDraft('Feature Delivery', '/tmp/Auto Run Docs', documents);
		const preview = buildWizardExecutionGraphPreview('/tmp/Auto Run Docs', documents);

		expect(draft.maxParallelism).toBe(2);
		expect(draft.promptProfile).toBe('full');
		expect(draft.skillPromptMode).toBe('full');
		expect(draft.skills).toEqual(
			expect.arrayContaining([
				'context-and-impact',
				'gitnexus',
				'maestro-openclaw-consult',
				'openclaw-agent-sync',
				'communication-protocol',
			])
		);
		expect(draft.definitionOfDone).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/active checkbox goal/i),
				expect.stringMatching(/relevant validation passed/i),
				expect.stringMatching(/handoff|failure pattern/i),
			])
		);
		expect(draft.verificationSteps).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/handoff\.md/i),
				expect.stringMatching(/context-and-impact|gitnexus/i),
				expect.stringMatching(/OpenClaw main/i),
			])
		);
		expect(draft.taskGraph?.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ documentIndex: 0, dependsOn: [] }),
				expect.objectContaining({
					documentIndex: 1,
					dependsOn: expect.arrayContaining(['phase-01-setup']),
				}),
				expect.objectContaining({
					documentIndex: 2,
					dependsOn: expect.arrayContaining(['phase-01-setup']),
				}),
				expect.objectContaining({
					documentIndex: 3,
					dependsOn: expect.arrayContaining(['phase-02-backend', 'phase-03-frontend']),
				}),
			])
		);
		expect(preview.summary).toMatch(/shared setup root/i);
		expect(preview.parallelismWarning).toMatch(/falls back to sequential execution/i);
		expect(preview.dependencyDescriptions).toContain('Phase-02-Backend waits for Phase-01-Setup.');
		expect(preview.dependencyDescriptions).toContain(
			'Phase-04-Integration-Review waits for Phase-02-Backend, Phase-03-Frontend.'
		);
	});

	it('falls back to sequential order when no final join document is detected', () => {
		const documents = [
			{
				filename: 'Phase-01-Setup.md',
				content: '# Setup\n\n- [ ] Prepare the foundation',
			},
			{
				filename: 'Phase-02-Backend.md',
				content: '# Backend\n\n- [ ] Implement the backend work',
			},
			{
				filename: 'Phase-03-Frontend.md',
				content: '# Frontend\n\n- [ ] Implement the frontend work',
			},
		];

		const draft = buildWizardPlaybookDraft('Sequential Review', '/tmp/Auto Run Docs', documents);
		const preview = buildWizardExecutionGraphPreview('/tmp/Auto Run Docs', documents);

		expect(draft.maxParallelism).toBeUndefined();
		expect(draft.taskGraph).toBeUndefined();
		expect(draft.promptProfile).toBe('full');
		expect(draft.skillPromptMode).toBe('full');
		expect(draft.skills).toContain('maestro-openclaw-consult');
		expect(preview.mode).toBe('sequential');
		expect(preview.summary).toMatch(/AI inferred a sequential execution order/i);
		expect(preview.parallelismWarning).toBeNull();
	});

	it('carries project memory execution context when provided', () => {
		const documents = [
			{
				filename: 'Phase-01-Setup.md',
				content: '# Setup\n\n- [ ] Prepare the foundation',
			},
		];

		const draft = buildWizardPlaybookDraft(
			'Project Memory Bound',
			'/tmp/Auto Run Docs',
			documents,
			undefined,
			{
				repoRoot: '/repo',
				taskId: 'PM-01',
				executorId: 'codex-main',
			}
		);

		expect(draft.projectMemoryExecution).toEqual({
			repoRoot: '/repo',
			taskId: 'PM-01',
			executorId: 'codex-main',
		});
	});

	it('carries project memory binding intent when provided', () => {
		const documents = [
			{
				filename: 'Phase-01-Setup.md',
				content: '# Setup\n\n- [ ] Prepare the foundation',
			},
		];

		const draft = buildWizardPlaybookDraft(
			'Project Memory Intent',
			'/tmp/Auto Run Docs',
			documents,
			undefined,
			null,
			{
				policyVersion: '2026-04-04',
				repoRoot: '/repo',
				sourceBranch: 'main',
				bindingPreference: 'shared-branch-serialized',
				sharedCheckoutAllowed: true,
				reuseExistingBinding: true,
				allowRebindIfStale: true,
			}
		);

		expect(draft.projectMemoryBindingIntent).toEqual({
			policyVersion: '2026-04-04',
			repoRoot: '/repo',
			sourceBranch: 'main',
			bindingPreference: 'shared-branch-serialized',
			sharedCheckoutAllowed: true,
			reuseExistingBinding: true,
			allowRebindIfStale: true,
		});
	});

	it('builds same-branch orchestration pack drafts when PM sessions are available', () => {
		const documents = [
			{
				filename: 'Phase-01-Runtime-Contract-Freeze.md',
				content: '# Contract Freeze\n\n- [ ] Freeze the runtime contract',
			},
			{
				filename: 'Phase-02A-Desktop-Executor-Fail-Closed.md',
				content: '# Desktop Lane\n\n- [ ] Wire desktop fail-closed execution',
			},
			{
				filename: 'Phase-02B-CLI-Executor-Fail-Closed.md',
				content: '# CLI Lane\n\n- [ ] Wire CLI fail-closed execution',
			},
			{
				filename: 'Phase-03-Shared-Checkout-Runtime-Join.md',
				content: '# Join\n\n- [ ] Integrate the shared runtime flow',
			},
			{
				filename: 'Phase-04A-Stale-Recovery-Hardening.md',
				content: '# Recovery\n\n- [ ] Harden stale recovery',
			},
			{
				filename: 'Phase-04C-Wizard-Task-Generation-Bridge.md',
				content: '# Wizard Bridge\n\n- [ ] Bridge wizard generation into runtime',
			},
			{
				filename: 'Phase-05-Validation-And-Promotion.md',
				content: '# Final Validation\n\n- [ ] Validate and promote the pack',
			},
		];

		const packDrafts = buildWizardPlaybookPackDrafts(
			'Project Memory Runtime Fast Track',
			'/tmp/Auto Run Docs',
			documents,
			[
				{ id: 'lead-session', name: 'PM-Lead' },
				{ id: 'desktop-session', name: 'PM-Desktop' },
				{ id: 'cli-session', name: 'PM-CLI' },
				{ id: 'integrator-session', name: 'PM-Integrator' },
				{ id: 'recovery-session', name: 'PM-Recovery' },
				{ id: 'wizard-session', name: 'PM-Wizard' },
				{ id: 'validator-session', name: 'PM-Validator' },
			]
		);

		expect(packDrafts).not.toBeNull();
		expect(packDrafts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sessionId: 'lead-session',
					playbookName: 'PM-SB-01 Contract Freeze',
				}),
				expect.objectContaining({
					sessionId: 'desktop-session',
					playbookName: 'PM-SB-02 Desktop Lane',
					dependsOnPlaybookNames: ['PM-SB-01 Contract Freeze'],
				}),
				expect.objectContaining({
					sessionId: 'cli-session',
					playbookName: 'PM-SB-03 CLI Lane',
					dependsOnPlaybookNames: ['PM-SB-01 Contract Freeze'],
				}),
				expect.objectContaining({
					sessionId: 'integrator-session',
					playbookName: 'PM-SB-05 Shared Runtime Join',
					dependsOnPlaybookNames: expect.arrayContaining([
						'PM-SB-02 Desktop Lane',
						'PM-SB-03 CLI Lane',
					]),
				}),
				expect.objectContaining({
					sessionId: 'validator-session',
					playbookName: 'PM-SB-08 Final Join And Validate',
					dependsOnPlaybookNames: ['PM-SB-07 Wizard Lane'],
				}),
			])
		);
	});
});
