import {SmppSession} from "./SmppSession";

export default interface SessionManager {
	sessions: SmppSession[];
	sessionId: number;

	addSession(session: SmppSession): Promise<void>;

	removeSession(session: SmppSession): Promise<void>;

	createSession(...args: any[]): Promise<SmppSession>;

	getSession(id: number): Promise<SmppSession>;

	serialize(): object;

	cleanup(): void;

	setup(): void;
}