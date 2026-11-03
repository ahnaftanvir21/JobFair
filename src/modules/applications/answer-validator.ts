import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '../../common/enums/index.js';
import type { JobQuestion } from '../jobs/entities/job-question.entity.js';
import type { AnswerDto } from './dto/application.dto.js';

/**
 * Checks a student's answers against the job's questions.
 * Returns the answers to store, in question order, or throws with every problem found.
 */
export function validateAnswers(
  questions: Pick<
    JobQuestion,
    'id' | 'text' | 'type' | 'options' | 'isRequired' | 'order'
  >[],
  answers: AnswerDto[],
): { questionId: string; answer: string }[] {
  const errors: string[] = [];
  const byQuestion = new Map<string, string>();

  for (const a of answers) {
    if (byQuestion.has(a.questionId)) {
      errors.push(`Question ${a.questionId} was answered more than once`);
    }
    byQuestion.set(a.questionId, a.answer);
  }

  const known = new Set(questions.map((q) => q.id));
  for (const id of byQuestion.keys()) {
    if (!known.has(id)) errors.push(`Question ${id} is not part of this job`);
  }

  const result: { questionId: string; answer: string }[] = [];
  for (const q of [...questions].sort((a, b) => a.order - b.order)) {
    const answer = byQuestion.get(q.id);
    if (answer === undefined) {
      if (q.isRequired)
        errors.push(`Question ${q.order} is required: "${q.text}"`);
      continue;
    }
    if (q.type === QuestionType.SINGLE_CHOICE && !q.options.includes(answer)) {
      errors.push(
        `Question ${q.order} must be one of: ${q.options.join(', ')}`,
      );
      continue;
    }
    result.push({ questionId: q.id, answer });
  }

  if (errors.length) throw new BadRequestException(errors);
  return result;
}
