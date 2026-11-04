/** Contact details of the AIUB Office of Placement & Alumni (OPA). */
export const OPA_CONTACT = {
  name: 'Office of Placement & Alumni (OPA)',
  university: 'American International University-Bangladesh (AIUB)',
  address: '408/1 (Old KA 66/1), Kuratoli, Khilkhet, Dhaka 1229, Bangladesh',
  phones: ['+88 02 841 4046-9', '+88 02 841 4050'],
  mobile: '+88 018 44 11 5007',
  email: 'opa@aiub.edu',
} as const;

const c = OPA_CONTACT;

/** Added to the end of every email. */
export const OPA_SIGNATURE_TEXT =
  `\n\n--\n${c.name}, ${c.university}\n${c.address}\n` +
  `Phone: ${c.phones.join(', ')} | Mobile: ${c.mobile}\nEmail: ${c.email}`;

export const OPA_SIGNATURE_HTML =
  `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px">` +
  `<p style="font-size:12px;color:#555;line-height:1.5">` +
  `<strong>${c.name.replace('&', '&amp;')}</strong>, ${c.university}<br>` +
  `${c.address}<br>` +
  `Phone: ${c.phones.join(', ')} | Mobile: ${c.mobile}<br>` +
  `Email: <a href="mailto:${c.email}">${c.email}</a></p>`;
