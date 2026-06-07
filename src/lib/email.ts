export type RegistrationEmailInput = {
  to: string;
  className: string;
  sessionLabel: string;
  location: string;
  route: string;
};

export async function sendRegistrationEmail(input: RegistrationEmailInput) {
  // MVP prototype: simulate a successful confirmation email.
  // A real email provider can replace this function later.
  return {
    sent: true,
    to: input.to,
  };
}
