variable "aws_region" {
  type        = string
  description = "AWS region (Stockix default: us-east-1)."
  default     = "us-east-1"
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC for the app server (e.g. vpc-07d37493c57f237ea)."
  default     = "vpc-07d37493c57f237ea"
}

variable "public_subnet_id" {
  type        = string
  description = "A public subnet in that VPC (must route 0.0.0.0/0 to an Internet Gateway) so the instance gets a public IP."
}

variable "key_name" {
  type        = string
  description = "Name of an existing EC2 key pair in this region (for SSH)."
}

variable "instance_type" {
  type        = string
  description = "Size; use t3.large or larger if you will run many tenant Docker stacks."
  default     = "t3.large"
}

variable "allowed_ssh_cidr" {
  type        = string
  description = "CIDR allowed to SSH (e.g. 203.0.113.10/32). Avoid 0.0.0.0/0 in production."
}

variable "associate_elastic_ip" {
  type        = bool
  description = "If true, allocate and attach a static Elastic IP (stable DNS / Cloudflare target)."
  default     = true
}

variable "root_volume_gb" {
  type        = number
  description = "Root EBS size in GiB (Docker images and tenant data need room)."
  default     = 100
}

variable "name_prefix" {
  type        = string
  default     = "stockix"
}
