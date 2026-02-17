"""
PedagogyMode.py
Enum defining available teaching modes for the AI tutor.
Each mode represents a different pedagogical approach.
"""
from enum import Enum


class PedagogyMode(str, Enum):
    """
    Enumeration of available pedagogy modes for the AI tutor.
    
    Each mode corresponds to a different teaching approach and has an
    associated prompt file in the prompts/ directory.
    """
    
    EXPLANATORY = "explanatory"
    """
    Explanatory Mode - Direct Instruction (Default)
    
    Provides clear, comprehensive explanations with examples and code.
    Direct teaching approach with step-by-step breakdowns.
    
    Best for: Learning new concepts, reference material, clear answers
    """
    
    CONCISE = "concise"
    """
    Concise Mode - UI-Friendly Responses

    Short, direct answers optimized for compact UI surfaces.
    Avoids extended explanations, padding, and unsolicited questions.

    Best for: Quick answers, summaries, minimal UI clutter
    """
    
    @classmethod
    def get_default(cls) -> "PedagogyMode":
        """
        Get the default pedagogy mode.
        
        Returns:
            PedagogyMode.EXPLANATORY - The default teaching mode
        """
        return cls.EXPLANATORY
    
    @classmethod
    def from_string(cls, mode_str: str) -> "PedagogyMode":
        """
        Convert a string to a PedagogyMode enum value.
        
        Args:
            mode_str: String representation of the mode (case-insensitive)
        
        Returns:
            Corresponding PedagogyMode enum value
        
        Raises:
            ValueError: If the mode string is not valid
        """
        if mode_str is None:
            return cls.get_default()
        
        try:
            return cls(mode_str.lower())
        except ValueError:
            valid_modes = ", ".join([mode.value for mode in cls])
            raise ValueError(
                f"Invalid pedagogy mode: '{mode_str}'. "
                f"Valid modes are: {valid_modes}"
            )
    
    def get_prompt_filename(self) -> str:
        """
        Get the filename of the prompt file for this mode.
        
        Returns:
            Filename in the prompts/ directory
        """
        prompt_files = {
            self.EXPLANATORY: "general_chat_prompt.md",
            self.CONCISE: "code_assistant_prompt.md",
        }
        return prompt_files[self]
    
    def get_description(self) -> str:
        """
        Get a human-readable description of this pedagogy mode.
        
        Returns:
            Description string
        """
        descriptions = {
            self.EXPLANATORY: "General Chat tutor behavior with clear explanations",
            self.CONCISE: "Code Assistant behavior with short, direct responses",
        }
        return descriptions.get(self, "Unknown mode")
