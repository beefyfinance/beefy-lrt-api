import { get } from 'lodash';

export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

export class GraphQueryError extends FriendlyError {
  constructor(e: unknown) {
    const message = get(e || {}, 'message', null) ?? e?.toString() ?? 'Unknown TheGraph error';
    super(message);
    this.name = 'GraphQueryError';
  }
}
