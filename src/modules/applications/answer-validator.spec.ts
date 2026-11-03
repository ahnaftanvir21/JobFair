import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '../../common/enums/index.js';
import { validateAnswers } from './answer-validator.js';

const questions = [
  {
    id: 'q2',
    text: 'Experience?',
    type: QuestionType.SINGLE_CHOICE,
    options: ['0', '1-2', '3+'],
    isRequired: true,
    order: 2,
  },
  {
    id: 'q1',
    text: 'Why this job?',
    type: QuestionType.TEXT,
    options: [],
    isRequired: true,
    order: 1,
  },
  {
    id: 'q3',
    text: 'Portfolio',
    type: QuestionType.TEXT,
    options: [],
    isRequired: false,
    order: 3,
  },
];

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    const response = (err as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
  throw new Error('expected validation to fail');
}

describe('validateAnswers', () => {
  it('returns answers in question order and skips unanswered optional ones', () => {
    const result = validateAnswers(questions, [
      { questionId: 'q2', answer: '1-2' },
      { questionId: 'q1', answer: 'I like it' },
    ]);
    expect(result).toEqual([
      { questionId: 'q1', answer: 'I like it' },
      { questionId: 'q2', answer: '1-2' },
    ]);
  });

  it('accepts no answers when the job has no questions', () => {
    expect(validateAnswers([], [])).toEqual([]);
  });

  it('reports every missing required question', () => {
    const errors = errorsOf(() => validateAnswers(questions, []));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('Question 1 is required');
    expect(errors[1]).toContain('Question 2 is required');
  });

  it('rejects a choice that is not one of the options', () => {
    const errors = errorsOf(() =>
      validateAnswers(questions, [
        { questionId: 'q1', answer: 'x' },
        { questionId: 'q2', answer: '10 years' },
      ]),
    );
    expect(errors).toEqual(['Question 2 must be one of: 0, 1-2, 3+']);
  });

  it('rejects answers to questions from another job', () => {
    const errors = errorsOf(() =>
      validateAnswers(questions, [
        { questionId: 'q1', answer: 'x' },
        { questionId: 'q2', answer: '0' },
        { questionId: 'other', answer: 'x' },
      ]),
    );
    expect(errors).toEqual(['Question other is not part of this job']);
  });

  it('rejects the same question answered twice', () => {
    const errors = errorsOf(() =>
      validateAnswers(questions, [
        { questionId: 'q1', answer: 'a' },
        { questionId: 'q1', answer: 'b' },
        { questionId: 'q2', answer: '0' },
      ]),
    );
    expect(errors[0]).toContain('answered more than once');
  });
});
