import 'moment';

declare module 'moment' {
  interface Moment {
    toMySqlDateTime(): string;
  }
}
