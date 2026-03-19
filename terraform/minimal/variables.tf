variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "key_pair_name" {
  description = "EC2 key pair name for SSH"
  type        = string
}

variable "admin_ip_cidr" {
  description = "CIDR allowed to SSH (e.g., 203.0.113.10/32)"
  type        = string
}

variable "bucket_name" {
  description = "Unique S3 bucket name for frontend"
  type        = string
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size (GB)"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default = {
    Project = "AI-Tutor"
    Env     = "prod"
  }
}
