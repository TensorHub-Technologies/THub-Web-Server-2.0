import transporter from "./mailer.js";

export const sendInviteEmail = async ({ to, inviteLink, workspace }) => {
  const mailOptions = {
    from: `"THub" <no-reply@thub.tech>`,
    to,
    subject: `You are invited to join workspace "${workspace}"`,
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>Workspace Invitation</h2>
        <p>You have been invited to join the workspace <b>${workspace}</b>.</p>
        <p>Click the button below to accept the invitation:</p>
        <a 
          href="${inviteLink}"
          style="
            display:inline-block;
            padding:10px 16px;
            background:#3c5ba4;
            color:#fff;
            text-decoration:none;
            border-radius:6px;
            margin-top:10px;
          "
        >
          Join Workspace
        </a>
        <p style="margin-top:20px;font-size:12px;color:#666">
          If you didn’t expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};
