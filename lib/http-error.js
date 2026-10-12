// Error dengan status HTTP; pesannya aman ditampilkan ke klien.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
