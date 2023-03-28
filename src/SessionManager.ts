import {SmppSession} from "./SmppSession";

export default interface SessionManager {
	sessions: SmppSession[];
	sessionId: number;
	identifier: string;
	readonly SESSION_ADDED_EVENT: string;

	addSession(session: SmppSession): Promise<void>;

	removeSession(session: SmppSession): Promise<void>;

	createSession(...args: any[]): Promise<SmppSession>;

	getSession(id: number): Promise<SmppSession>;

	getSessions(): Promise<SmppSession[]>;

	serialize(): object;

	cleanup(): void;

	setup(): void;

	on(event: string, listener: (...args: any[]) => void): void;
}