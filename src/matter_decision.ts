export type MatterIntake = {
  matterId: string;
  clientName: string;
  signedDocumentUrl: string;
  deadline: string;
  question: string;
};

export type MatterDecision = {
  delivery: "deliver-signed-document";
  followUp: "same-day" | "scheduled";
  deadlineStatus: "urgent" | "upcoming";
};

export function decideMatterWorkflow(input: MatterIntake, now: Date): MatterDecision {
  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.valueOf())) {
    throw new Error("deadline must be an ISO-8601 date");
  }

  const hoursUntilDeadline = (deadline.valueOf() - now.valueOf()) / 3_600_000;
  return {
    delivery: "deliver-signed-document",
    followUp: hoursUntilDeadline <= 48 ? "same-day" : "scheduled",
    deadlineStatus: hoursUntilDeadline <= 48 ? "urgent" : "upcoming"
  };
}
