export type AiWikiSourceMode = 'local' | 'ssh';

export interface AiWikiProjectRequest {
	projectRoot: string;
	projectId?: string;
	sshRemoteId?: string | null;
}

export interface AiWikiState {
	sourceMode: AiWikiSourceMode;
	projectRoot: string;
	sshRemoteId?: string;
	branch: string | null;
	lastIndexedSha: string | null;
	lastKnownRemoteSha: string | null;
	lastUpdatedAt: string;
}

export interface AiWikiChangedFile {
	path: string;
	source: 'tracked' | 'uncommitted';
}

export interface AiWikiSourceSnapshot {
	projectId: string;
	wikiPath: string;
	state: AiWikiState;
	headSha: string | null;
	remoteSha: string | null;
	changedFiles: AiWikiChangedFile[];
}

export interface AiWikiContextPacket {
	projectId: string;
	projectRoot: string;
	sourceMode: AiWikiSourceMode;
	branch: string | null;
	lastIndexedSha: string | null;
	lastKnownRemoteSha: string | null;
	changedFiles: AiWikiChangedFile[];
	summary: string;
	generatedAt: string;
}
