"""
BatchJobManager: Manages async batch processing jobs for question generation and evaluation.
Simple in-memory implementation for MVP (could be replaced with DynamoDB for persistence).
"""
import uuid
import threading
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from enum import Enum


class JobStatus(str, Enum):
    """Job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    """Job type enumeration."""
    QUESTION_GENERATION = "question_generation"
    EVALUATION = "evaluation"


class BatchJobManager:
    """Manages async batch jobs with in-memory storage."""
    
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
    
    def create_job(
        self,
        job_type: JobType,
        assessment_id: str,
        total_items: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a new batch job.
        
        Args:
            job_type: Type of job (generation or evaluation)
            assessment_id: Assessment identifier
            total_items: Total number of items to process
            metadata: Optional additional metadata
            
        Returns:
            Job ID
        """
        job_id = str(uuid.uuid4())
        
        with self.lock:
            self.jobs[job_id] = {
                "job_id": job_id,
                "job_type": job_type,
                "assessment_id": assessment_id,
                "status": JobStatus.PENDING,
                "total_items": total_items,
                "processed_count": 0,
                "successful_count": 0,
                "failed_count": 0,
                "started_at": datetime.utcnow().isoformat() + "Z",
                "completed_at": None,
                "error": None,
                "metadata": metadata or {}
            }
        
        return job_id
    
    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID."""
        with self.lock:
            return self.jobs.get(job_id)
    
    def update_status(self, job_id: str, status: JobStatus, error: Optional[str] = None):
        """Update job status."""
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["status"] = status
                if error:
                    self.jobs[job_id]["error"] = error
                if status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                    self.jobs[job_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"
    
    def increment_progress(self, job_id: str, success: bool = True):
        """Increment job progress counters."""
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["processed_count"] += 1
                if success:
                    self.jobs[job_id]["successful_count"] += 1
                else:
                    self.jobs[job_id]["failed_count"] += 1
    
    def run_batch_job(
        self,
        job_id: str,
        items: List[Any],
        process_func: Callable[[Any], bool],
        on_complete: Optional[Callable[[str], None]] = None
    ):
        """
        Run a batch job in a background thread.
        
        Args:
            job_id: Job identifier
            items: List of items to process
            process_func: Function to process each item (returns True if successful)
            on_complete: Optional callback when job completes
        """
        def _run():
            try:
                self.update_status(job_id, JobStatus.RUNNING)
                
                for item in items:
                    try:
                        success = process_func(item)
                        self.increment_progress(job_id, success=success)
                    except Exception as e:
                        print(f"[BatchJob {job_id}] Error processing item: {e}")
                        self.increment_progress(job_id, success=False)
                
                self.update_status(job_id, JobStatus.COMPLETED)
                
                if on_complete:
                    on_complete(job_id)
                    
            except Exception as e:
                print(f"[BatchJob {job_id}] Job failed: {e}")
                self.update_status(job_id, JobStatus.FAILED, error=str(e))
        
        thread = threading.Thread(target=_run)
        thread.daemon = True
        thread.start()
    
    def list_jobs(
        self,
        assessment_id: Optional[str] = None,
        job_type: Optional[JobType] = None
    ) -> List[Dict[str, Any]]:
        """
        List all jobs, optionally filtered.
        
        Args:
            assessment_id: Filter by assessment ID
            job_type: Filter by job type
            
        Returns:
            List of job dictionaries
        """
        with self.lock:
            jobs = list(self.jobs.values())
            
            if assessment_id:
                jobs = [j for j in jobs if j["assessment_id"] == assessment_id]
            
            if job_type:
                jobs = [j for j in jobs if j["job_type"] == job_type]
            
            return jobs
    
    def clear_old_jobs(self, hours: int = 24):
        """Clear jobs older than specified hours (for memory management)."""
        cutoff = datetime.utcnow().timestamp() - (hours * 3600)
        
        with self.lock:
            to_delete = []
            for job_id, job in self.jobs.items():
                started_at = datetime.fromisoformat(job["started_at"].replace("Z", "+00:00"))
                if started_at.timestamp() < cutoff:
                    to_delete.append(job_id)
            
            for job_id in to_delete:
                del self.jobs[job_id]
            
            if to_delete:
                print(f"[BatchJobManager] Cleared {len(to_delete)} old jobs")


# Global singleton instance
_batch_job_manager = None

def get_batch_job_manager() -> BatchJobManager:
    """Get or create the global BatchJobManager instance."""
    global _batch_job_manager
    if _batch_job_manager is None:
        _batch_job_manager = BatchJobManager()
    return _batch_job_manager
