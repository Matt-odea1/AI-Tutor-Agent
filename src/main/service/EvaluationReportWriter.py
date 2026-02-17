from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


class EvaluationReportWriter:
    def save_detailed_json(
        self,
        output_dir: Path,
        student_name: str,
        evaluations: List[Dict[str, Any]],
        responses: List[Dict[str, str]],
    ) -> Path:
        filepath = output_dir / "evaluation.json"
        data = {
            "student_name": student_name,
            "evaluation_date": datetime.now().isoformat(),
            "total_questions": len(evaluations),
            "evaluations": evaluations,
        }
        with open(filepath, "w", encoding="utf-8") as file_obj:
            json.dump(data, file_obj, indent=2, ensure_ascii=False)
        return filepath

    def save_summary_csv(self, output_dir: Path, evaluations: List[Dict[str, Any]]) -> Path:
        filepath = output_dir / "scores.csv"
        fieldnames = [
            "question_number",
            "question_type",
            "correctness_score",
            "understanding_score",
            "total_score",
            "percentage",
            "feedback_summary",
        ]

        with open(filepath, "w", newline="", encoding="utf-8") as file_obj:
            writer = csv.DictWriter(file_obj, fieldnames=fieldnames)
            writer.writeheader()
            for eval_data in evaluations:
                writer.writerow(
                    {
                        "question_number": eval_data.get("question_number", ""),
                        "question_type": eval_data.get("question_type", ""),
                        "correctness_score": eval_data.get("correctness_score", 0),
                        "understanding_score": eval_data.get("understanding_score", 0),
                        "total_score": eval_data.get("total_score", 0),
                        "percentage": round(eval_data.get("total_score", 0) * 10, 1),
                        "feedback_summary": eval_data.get("feedback", ""),
                    }
                )
        return filepath

    def save_report(
        self,
        output_dir: Path,
        student_name: str,
        evaluations: List[Dict[str, Any]],
        total_score: float,
        max_score: float,
        percentage: float,
        grade: str,
        correctness_avg: float,
        understanding_avg: float,
    ) -> Path:
        filepath = output_dir / "report.md"

        with open(filepath, "w", encoding="utf-8") as file_obj:
            file_obj.write("# Oral Exam Evaluation Report\n\n")
            file_obj.write(f"**Student:** {student_name}\n\n")
            file_obj.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            file_obj.write(f"**Overall Grade:** {grade} ({percentage:.1f}%)\n\n")
            file_obj.write("---\n\n")

            file_obj.write("## Summary\n\n")
            file_obj.write(f"- **Total Questions:** {len(evaluations)}\n")
            file_obj.write(f"- **Total Score:** {total_score:.1f}/{max_score}\n")
            file_obj.write(f"- **Percentage:** {percentage:.1f}%\n")
            file_obj.write(f"- **Average Correctness:** {correctness_avg:.2f}/5\n")
            file_obj.write(f"- **Average Understanding:** {understanding_avg:.2f}/5\n\n")
            file_obj.write("---\n\n")

            file_obj.write("## Question-by-Question Results\n\n")
            for eval_data in evaluations:
                q_num = eval_data.get("question_number", "?")
                q_type = eval_data.get("question_type", "unknown")
                question = eval_data.get("question", "")
                correctness = eval_data.get("correctness_score", 0)
                understanding = eval_data.get("understanding_score", 0)
                total = eval_data.get("total_score", 0)

                file_obj.write(f"### Question {q_num} ({q_type.capitalize()}) - {total}/10 ({total * 10}%)\n\n")
                file_obj.write(f"**Question:** {question}\n\n")
                file_obj.write("**Score Breakdown:**\n")
                file_obj.write(f"- Correctness: {correctness}/5\n")
                file_obj.write(f"- Understanding: {understanding}/5\n")
                file_obj.write(f"- **Total: {total}/10**\n\n")

                strengths = eval_data.get("strengths", [])
                if strengths:
                    file_obj.write("**Strengths:**\n")
                    for strength in strengths:
                        file_obj.write(f"- {strength}\n")
                    file_obj.write("\n")

                weaknesses = eval_data.get("weaknesses", [])
                if weaknesses:
                    file_obj.write("**Areas for Improvement:**\n")
                    for weakness in weaknesses:
                        file_obj.write(f"- {weakness}\n")
                    file_obj.write("\n")

                feedback = eval_data.get("feedback", "")
                if feedback:
                    file_obj.write(f"**Feedback:** {feedback}\n\n")

                suggestions = eval_data.get("suggested_improvements", [])
                if suggestions:
                    file_obj.write("**Suggested Improvements:**\n")
                    for suggestion in suggestions:
                        file_obj.write(f"- {suggestion}\n")
                    file_obj.write("\n")

                file_obj.write("---\n\n")

            file_obj.write("## Overall Performance\n\n")
            file_obj.write(f"You scored {total_score:.1f} out of {max_score} points ({percentage:.1f}%), ")
            file_obj.write(f"earning a grade of **{grade}**.\n\n")

            if percentage >= 80:
                file_obj.write("Excellent work! You demonstrated strong technical knowledge and clear understanding.\n")
            elif percentage >= 60:
                file_obj.write("Good job! You showed competent understanding with room for deepening your knowledge.\n")
            elif percentage >= 40:
                file_obj.write("Your responses show developing understanding. Focus on the suggested improvements.\n")
            else:
                file_obj.write("Your responses indicate areas needing significant improvement. Review the feedback carefully.\n")

        return filepath
